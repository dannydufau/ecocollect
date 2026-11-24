\getenv user_db_password USER_DB_PASSWORD
SELECT format('ALTER ROLE ecocollect_user LOGIN PASSWORD %L', :'user_db_password') \gexec
