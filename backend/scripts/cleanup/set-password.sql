\getenv cleanup_db_password CLEANUP_DB_PASSWORD
SELECT format('ALTER ROLE ecocollect_cleanup LOGIN PASSWORD %L', :'cleanup_db_password') \gexec