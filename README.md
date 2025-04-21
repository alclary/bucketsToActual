# Buckets to Actual Budget Data Importer
This small js program works to extract data from an existing [Buckets](https://www.budgetwithbuckets.com/) budget database (.buckets file is an sqlite db) and export it into an [Actual budget](https://actualbudget.org/) via [Actual's API](https://actualbudget.org/docs/api/). 

> [!WARNING] 
> This program was developed just enough for a successful data migration. You may find pieces of the code insightful, but it may not work as-is with your own data. Nor may it work past the Actual budget version 25.4.0. I also highly suggest reviewing [this webpage](https://actualbudget.org/docs/api/#writing-data-importers) for how my approach could be improved upon.

# How to Run
Execute the `run.sh` script after creating a `.env` file in the same directory structured as follows:
```
# Budget data will be cached here
DATA_DIR='./data'

# URL of your running Actual Budget server
ACTUAL_URL='YOUR ACTUAL ENDPOINT HERE'

# Password you use to log into the above server
ACTUAL_PASSWORD='YOUR PASSWORD HERE'

# 'Sync ID' of Actual Budget you would like import to. From 'Advanced Settings' in Actual GUI
ACTUAL_SYNC_ID='YOUR ACTUAL SYNC ID HERE'

# Buckets file (SQLite DB) to import; NOTE .buckets file type is openable by SQLite 
BUCKETS_FILE='YOUR .buckets FILE HERE'
```
