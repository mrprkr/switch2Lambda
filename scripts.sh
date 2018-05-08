aws lambda create-function \
--region eu-west-1 \
--function-name switch2Login \
--zip-file fileb://~/Development/switch2Lambda/lambda.zip \
--role arn:aws:iam::736905440528:role/BasicExecutor \
--handler index.handler \
--runtime nodejs8.10 \
--timeout 3 \
--description "Logs in to switch2" \
--profile personal \
--debug


aws lambda update-function-code \
--function-name switch2Login \
--zip-file fileb://~/Development/switch2Lambda/lambda.zip \
--profile personal \
--region eu-west-1 \
--publish
