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
  const bucketAccounts = {};
  for (const obj of getBucketAccts.all()) {
    bucketAccounts[obj.id] = {
      name: obj.name,
      initial: obj.starting_balance,
    };
  }
  console.log(bucketAccounts);
  return bucketAccounts;
};

const fetchActualAccounts = async () => {
  // Fetch Current Accounts from ActualBudget
  const apiAccounts = await api.getAccounts();
  return [...apiAccounts];
};

const fetchBucketsCategories = () => {
  // GET Groups and Categories from Buckets DB
  const getBucketGroups = sqliteDB.prepare(
    `SELECT bucket.name AS bucketName,
      bucket.id AS bucketId, 
      COALESCE(bucket_group.name, 'Misc') AS groupName
    FROM bucket
    LEFT JOIN bucket_group ON bucket.group_id=bucket_group.id;`
  );
  const bucketCategories = {};
  for (const obj of getBucketGroups.all()) {
    if (obj.bucketId == "x-license") {
      continue;
    }
    bucketCategories[obj.bucketId] = {
      name: obj.bucketName,
      group: obj.groupName,
    };
  }
  console.log(bucketCategories);
  return bucketCategories;
};

const transferAccounts = async (bucketAccounts) => {
  // Create accounts in actual and save the actual account id
  for (const [id, account] of Object.entries(bucketAccounts)) {
    // TODO Check if account already in list (helps w/ dev)
    account["actualId"] = await api.createAccount(
      { name: account.name, type: "other" },
      account.initial
    );
  }
};

const DEBUGdeleteActualAccounts = async (actualAccounts) => {
  for (let account of actualAccounts) {
    await api.deleteAccount(account.id);
  }
};

const DEBUGdeleteActualCategories = async () => {
  const catGroups = await api.getCategoryGroups();
  for (let group of catGroups) {
    if (group.name != "Income") {
      for (let cat of group.categories) {
        api.deleteCategory(cat.id);
      }
      api.deleteCategoryGroup(group.id);
    }
  }
};

const main = async () => {
  // Initialize Actual API connection
  await api.init({
    dataDir: process.env.DATA_DIR,
    serverURL: process.env.ACTUAL_URL,
    password: process.env.ACTUAL_PASSWORD,
  });

  // Fetch actual budget to be imported to
  await api.downloadBudget(process.env.ACTUAL_SYNC_ID, {
    password: process.env.ACTUAL_PASSWORD,
  });

  // Initialize Buckets SQLite DB connection
  initBucketDB();

  // Fetch Accounts
  const bucketAccounts = fetchBucketAccounts();
  let actualAccounts = await fetchActualAccounts();
  DEBUGdeleteActualAccounts(actualAccounts);

  // Move Accounts from Buckets to Actual
  transferAccounts(bucketAccounts);

  // Fetch Bucket Groups and Buckets (aka Categories)
  const bucketCategories = fetchBucketsCategories();
  DEBUGdeleteActualCategories();
  // TODO get budget_group + budget nested list via SQL join query
  // TODO create category schema in actual budget

  // TODO get full transaction list
  // TODO special handle tranfer transactions?
  // TODO insert all other transactions?

  //let groups = await api.getCategoryGroups();
  //console.log(groups);
  await api.shutdown();
};

if (require.main === module) {
  main();
}
