const api = require("@actual-app/api");
const { DatabaseSync } = require("node:sqlite");
let sqliteDB = undefined;

const initBucketDB = async () => {
  // Open the buckets file to be imported (sqlite file)
  sqliteDB = new DatabaseSync(process.env.BUCKETS_FILE);
};

const fetchBucketAccounts = () => {
  // Get accounts from Buckets DB
  const getBucketAccts = sqliteDB.prepare(
    `SELECT id, name, starting_balance FROM account;`
  );
  // Tranform DB output to JSON object
  const accountIds = {};
  for (const obj of getBucketAccts.all()) {
    accountIds[obj.id] = {
      name: obj.name,
      initial: obj.starting_balance,
      actualId: null,
    };
  }
  return accountIds;
};

const fetchBucketGroups = () => {
  // Get Groups and Categories from Buckets DB
  const getBucketGroups = sqliteDB.prepare(
    `SELECT bucket.name AS bucketName,
      bucket.id AS bucketId, 
      COALESCE(bucket_group.name, 'Misc') AS groupName
    FROM bucket
    LEFT JOIN bucket_group ON bucket.group_id=bucket_group.id;`
  );
  const catIds = {};
  const catByGroup = {};
  for (const bucket of getBucketGroups.all()) {
    // Ignore Buckets' unlicenced category
    if (bucket.bucketId == "x-license") continue;
    else {
      // Add category to ID map
      catIds[bucket.bucketId] = {
        name: bucket.bucketName,
        group: bucket.groupName,
        actualId: null,
      };
      // Add nested category under group map
      catByGroup[bucket.groupName] = [
        { name: bucket.bucketName, id: bucket.bucketId },
        ...(catByGroup[bucket.groupName] ? catByGroup[bucket.groupName] : []),
      ];
    }
  }
  return [catIds, catByGroup];
};

const fetchTransactions = () => {
  // Get all transactions from BucketDB in with categories and xfer indication
  const getTransactions = sqliteDB.prepare(
    `SELECT 
      account_transaction.id AS imported_id,
      account_transaction.created AS 'date',
      account_transaction.account_id,
      bucket_transaction.bucket_id AS category,
      CASE 
        WHEN account_transaction.general_cat = 'transfer' THEN 1
        ELSE 0
      END AS transfer,
      COALESCE (bucket_transaction.amount, account_transaction.amount) AS amount,
      account_transaction.memo AS notes
    FROM account_transaction
    FULL JOIN bucket_transaction ON account_transaction.id=bucket_transaction.account_trans_id
    WHERE account_transaction.id IS NOT NULL
    ORDER BY 'date'`
  )
  return getTransactions.all()
}

const importAccounts = async (accountIds) => {
  // Create accounts in actual and save the actual account to local object
  for (const [i, account] of Object.entries(accountIds)) {
    accountIds[i].actualId = await api.createAccount(
      { name: account.name, type: "other" },
      account.initial
    );
  }
};

const importCategories = async (catByGroup, catIds) => {
  for (const parent in catByGroup) {
    actualParentId = await api.createCategoryGroup({ name: parent })
    for (const [i, subGroup] of Object.entries(catByGroup[parent])) {
      try {
        catIds[subGroup.id].actualId = await api.createCategory({
          name: subGroup.name || `Misc ${i}`, // Unamed as "Misc i"
          group_id: actualParentId
      })}
      catch (err) {
        // Log warning to console (likely a duplicate bucket/category)
        console.warn(err.message)
        continue
      }
    } 
  }
}

const processTransactions = async (transactions, accountIds, catIds) => {
  const completed = []
  for (const [i, transaction] of Object.entries(transactions)) {
    // If transaction in already completed list (search backwards), continue
    if (completed.includes(parseInt(i))) {
      continue
    }
    // If transaction is a transfer, search ahead in array to locate match and link it
    else if (transaction.transfer) {
      processTransfers(transactions, i, completed);
    }
    // Translate original (Buckets) ids and data to Actual Ids
    transaction.date = transaction.date.split(" ")[0] // Remove timestamp
    transaction.account = accountIds[transaction.account_id].actualId
    if (transaction.category) {
      transaction.category = catIds[transaction.category].actualId
    }
    transaction.cleared = true
    }
  // remove the transfer duplicate rows from transactions array
  for (let index of completed) {
    transactions.splice(index, 1)
  }
  return transactions
  }

const processTransfers = (transactionList, currentIterator, completed) => {
  // If xfer is last element, break (no match)
  if (parseInt(currentIterator) == transactionList.length - 1) {
    console.warn("WARNING: Last element is transfer. No matching transaction.")
    return
  }
  else {
    for (k = parseInt(currentIterator) + 1; k < transactionList.length; k++) {
      if (transactionList[k].category === null && 
        (transactionList[k].amount == transactionList[currentIterator].amount * -1)) {
        // DEBUG 
        // console.log("MATCHED:", currentIterator, "and", k)
        // Set 'transfer_id' to indicate account of matched transaction
        transactionList[currentIterator].transfer_id = transactionList[k].account_id
        // Add matched transaction to completed list, to skip in subsequent iteration
        completed.push(k)
        return
      }
      else if (k == transactionList.length - 1) {
        console.error(`ERROR: Transfer transaction ${currentIterator} is unmatched.`)
        return
      }
    }
  }
}

const importTransactions = async (transactionList, accountIds) => {
  for (const [id, account] of Object.entries(accountIds)) {
    console.log(`Adding ${account.actualId} - ${account.name}`)
    // console.log(transactionList.filter(transaction => transaction.account_id === account.actualId))
    let result = await api.addTransactions(
      account.actualId,
      transactionList.filter(transaction => transaction.account_id === account.actualId),
      runTransfers = true
    )
    console.log(result)
  }
}

const DEBUGdeleteActualAccounts = async () => {
  const actualAccounts = await api.getAccounts();
  for (let account of actualAccounts) {
    await api.deleteAccount(account.id);
  }
};

const DEBUGdeleteActualCategories = async () => {
  const catGroups = await api.getCategoryGroups();
  for (let group of catGroups) {
    // Ignore Income Group, as Actual Budget will break if removed
    if (group.name != "Income") {
      for (let cat of group.categories) {
        api.deleteCategory(cat.id);
      }
      api.deleteCategoryGroup(group.id);
    }
  }
};

const DEBUGdeleteActualTransactions = async () => {
  const transactions = await api.getTransactions();
  for (let transaction of transactions){
    api.deleteTransaction(transaction.id);
  }
}

const main = async () => {
  // Initialize Actual API connection
  await api.init({
    dataDir: process.env.DATA_DIR,
    serverURL: process.env.ACTUAL_URL,
    password: process.env.ACTUAL_PASSWORD,
  });

  // Fetch actual budget
  await api.downloadBudget(process.env.ACTUAL_SYNC_ID);

  // Initialize Buckets SQLite DB connection
  initBucketDB();

  // Remove Any Existing Actual Data
  await DEBUGdeleteActualAccounts();
  await DEBUGdeleteActualCategories();
  await DEBUGdeleteActualTransactions();

  // Fetch and Import Accounts
  const accountIds = fetchBucketAccounts();
  await importAccounts(accountIds);

  // Fetch and Import Categories (aka "Buckets")
  const [catIds, catByGroup] = fetchBucketGroups();
  await importCategories(catByGroup, catIds);

  // DEBUG
  // console.log("Accounts:", accountIds)
  // console.log("Categories", catIds);


  
  // Fetch and Process Transactions
  const transactions = fetchTransactions();
  const clean_transactions = await processTransactions(transactions, accountIds, catIds);

  // console.log(clean_transactions)

  // Import Transactions by Account
  await importTransactions(clean_transactions, accountIds)

  await api.shutdown();
};

if (require.main === module) {
  main();
}
