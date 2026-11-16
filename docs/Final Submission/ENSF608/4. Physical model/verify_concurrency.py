"""Run on the freshly seeded course database with Python 3 and psql."""
import argparse
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('database')
parser.add_argument('--psql', default='psql')
args = parser.parse_args()
command = [args.psql, '-X', '-w', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
           '-v', 'VERBOSITY=verbose', '-d', args.database]
prefix = 'SET search_path TO ecocollect608, public; '


def run(sql):
    result = subprocess.run(command + ['-c', prefix + sql], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def uid(kind, number):
    return f"'{kind:08x}-0000-4000-8000-{number:012x}'"


def race(name, first_sql, second_sql):
    first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True)
    second = None
    try:
        first.stdin.write("BEGIN; " + prefix + "SET LOCAL lock_timeout='5s'; "
                          + first_sql + "; SELECT 'ready';\n")
        first.stdin.flush()
        while True:
            line = first.stdout.readline()
            if line.strip() == 'ready':
                break
            if not line:
                raise RuntimeError(first.stderr.read())
        second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True)
        second.stdin.write("BEGIN; " + prefix + "SET LOCAL lock_timeout='5s'; "
                           + 'SELECT pg_backend_pid(); ' + second_sql + '; COMMIT;\n\\q\n')
        second.stdin.flush()
        pid = int(second.stdout.readline().strip())
        deadline = time.monotonic() + 4
        while run(f"SELECT COALESCE(wait_event_type,'') FROM pg_stat_activity WHERE pid={pid}") != 'Lock':
            if time.monotonic() > deadline:
                raise RuntimeError(name + ': second writer did not wait for the parent lock')
            time.sleep(0.03)
        first.stdin.write('COMMIT;\n\\q\n')
        first.stdin.flush()
        first.wait(timeout=10)
        second.wait(timeout=10)
        error = second.stderr.read()
        if first.returncode != 0 or second.returncode == 0 or '23514' not in error:
            raise RuntimeError(name + ': unexpected result\n' + first.stderr.read() + error)
        print(name + ': second writer waited, then was rejected (23514)')
    finally:
        for process in (first, second):
            if process is not None:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=10)
                for stream in (process.stdin, process.stdout, process.stderr):
                    stream.close()


if run("SELECT COUNT(*) FROM volunteer_preferred_postal_code WHERE account_id='volunteer3'") != '0':
    raise RuntimeError('Run this check on the freshly seeded database.')
try:
    run("CALL add_preferred_code('volunteer3','T2P1J9'); CALL add_preferred_code('volunteer3','T2N1N4')")
    race('Preferred-code limit', "CALL add_preferred_code('volunteer3','T2T4M3')",
         "CALL add_preferred_code('volunteer3','T3K2L7')")
finally:
    run("DELETE FROM volunteer_preferred_postal_code WHERE account_id='volunteer3'")

original_sequence = int(run(f'SELECT request_seq FROM pickup_request WHERE pickup_request_id={uid(3,1)}'))
try:
    for number, actor in ((901, 'volunteer2'), (902, 'volunteer3')):
        run(f"INSERT INTO terms_acceptance VALUES ({uid(2,number)},{uid(1,2)},'{actor}',CURRENT_TIMESTAMP,'AT_VOLUNTEER_ACCEPTANCE')")
    race('Unfinished assignment limit',
         f'CALL accept_request({uid(5,901)},{uid(4,1)},{uid(2,901)})',
         f'CALL accept_request({uid(5,902)},{uid(4,101)},{uid(2,902)})')
finally:
    run(f'DELETE FROM status_change WHERE pickup_request_id={uid(3,1)} AND changed_at IN '
        f'(SELECT accepted_at FROM terms_acceptance WHERE terms_acceptance_id IN ({uid(2,901)},{uid(2,902)})); '
        f'DELETE FROM assignment WHERE assignment_id IN ({uid(5,901)},{uid(5,902)}); '
        f'DELETE FROM terms_acceptance WHERE terms_acceptance_id IN ({uid(2,901)},{uid(2,902)}); '
        f'UPDATE pickup_request SET request_seq={original_sequence} WHERE pickup_request_id={uid(3,1)}')

try:
    run(f'INSERT INTO assignment SELECT {uid(5,903)},pickup_window_id,terms_acceptance_id,accepted_at,collected_at,ended_at,end_reason FROM assignment WHERE assignment_id={uid(5,9)}; '
        "INSERT INTO photo VALUES ('concurrency-evidence','/sample/test-evidence.jpg'); "
        f"INSERT INTO delivery VALUES ({uid(7,903)},{uid(5,903)},{uid(6,1)},'concurrency-evidence')")

    def award(number):
        return (f'SELECT 1 FROM assignment WHERE assignment_id={uid(5,903)} FOR UPDATE; '
                f"INSERT INTO ecopoints_award VALUES ({uid(8,number)},{uid(5,903)},5.70,'(3 * quantity + 4 * estimated_weight_kg) / 2'); "
                f'INSERT INTO resident_award VALUES ({uid(8,number)}); CALL check_business_rules()')

    race('Award role limit', award(901), award(902))
finally:
    run(f'DELETE FROM resident_award WHERE ecopoints_award_id IN ({uid(8,901)},{uid(8,902)}); '
        f'DELETE FROM ecopoints_award WHERE ecopoints_award_id IN ({uid(8,901)},{uid(8,902)}); '
        f'DELETE FROM delivery WHERE delivery_id={uid(7,903)}; '
        "DELETE FROM photo WHERE file_id='concurrency-evidence'; "
        f'DELETE FROM assignment WHERE assignment_id={uid(5,903)}')

try:
    run("INSERT INTO photo VALUES ('concurrency-photo','/sample/test-item.jpg')")
    race('Photo exclusivity', f"CALL attach_item_photo({uid(3,11)},'concurrency-photo')",
         "SELECT 1 FROM photo WHERE file_id='concurrency-photo' FOR UPDATE; "
         f"UPDATE delivery SET file_id='concurrency-photo' WHERE delivery_id={uid(7,4)}; CALL check_business_rules()")
finally:
    run(f'UPDATE pickup_request SET file_id=NULL WHERE pickup_request_id={uid(3,11)}; '
        "DELETE FROM photo WHERE file_id='concurrency-photo'")
run('CALL check_business_rules()')
print('All four concurrency checks passed; test rows removed.')
