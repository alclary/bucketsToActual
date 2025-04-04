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
  const accountIdMap = {};
  for (const obj of getBucketAccts.all()) {
    accountIdMap[obj.id] = {
      name: obj.name,
      initial: obj.starting_balance,
      actualId: null,
    };
  }
  console.log(accountIdMap);
  return accountIdMap;
};

const fetchBucketGroups = () => {
  // GET Groups and Categories from Buckets DB
  const getBucketGroups = sqliteDB.prepare(
    `SELECT bucket.name AS bucketName,
      bucket.id AS bucketId, 
      COALESCE(bucket_group.name, 'Misc') AS groupName
    FROM bucket
    LEFT JOIN bucket_group ON bucket.group_id=bucket_group.id;`
  );
  const catIdMap = {};
  const groupCatMap = {};
  for (const bucket of getBucketGroups.all()) {
    // Ignore Buckets' unlicenced category
    if (bucket.bucketId == "x-license") continue;
    else {
      // Add category to ID map
      catIdMap[bucket.bucketId] = {
        name: bucket.bucketName,
        group: bucket.groupName,
        actualId: null,
      };
      // Add nested category under group map
      groupCatMap[bucket.groupName] = [
        { name: bucket.bucketName, id: bucket.bucketId },
        ...(groupCatMap[bucket.groupName] ? groupCatMap[bucket.groupName] : []),
      ];
    }
  }
  console.log("cat ID map", catIdMap);
  console.log("nested groups", groupCatMap);
  return [catIdMap, groupCatMap];
};

const transferAccounts = async (accountIdMap) => {
  // Create accounts in actual and save the actual account id
  for (const [id, account] of Object.entries(accountIdMap)) {
    accountIdMap[id].actualId = await api.createAccount(
      { name: account.name, type: "other" },
      account.initial
    );
  }
  console.log(accountIdMap);
};

const transferCategories = async (bucketGroups) => {};

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

const main = async () => {
  // Initialize Actual API connection
  await api.init({
    dataDir: process.env.DATA_DIR,
    serverURL: process.env.ACTUAL_URL,
    password: process.env.ACTUAL_PASSWORD,
  });

  // Fetch actual budget to be imported to
  await api.downloadBudget(process.env.ACTUAL_SYNC_ID);
  // await api.downloadBudget(process.env.ACTUAL_SYNC_ID, {
  //   password: process.env.ACTUAL_PASSWORD,
  // });

  // Initialize Buckets SQLite DB connection
  initBucketDB();

  // Remove Any Existing Actual accounts
  DEBUGdeleteActualAccounts();

  // Move Accounts from Buckets to Actual
  const accountIdMap = fetchBucketAccounts();
  transferAccounts(accountIdMap);

  // Remove Any Existing Actual Groups/Categories (except Income)
  DEBUGdeleteActualCategories();

  // Fetch Bucket Groups and Buckets (aka Categories)
  const [catIdMap, groupCatMap] = fetchBucketGroups();
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
