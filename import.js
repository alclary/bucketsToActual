const api = require("@actual-app/api");
const { DatabaseSync } = require("node:sqlite");

const main = async () => {
  await api.init({
    // Budget data will be cached locally here, in subdirectories for each file.
    dataDir: process.env.DATADIR,
    // This is the URL of your running server
    serverURL: process.env.SERVERURL,
    // This is the password you use to log into the server
    password: process.env.PASSWORD,
  });

  // Fetch actual budget to be imported to *ideally fresh*
  await api.downloadBudget(process.env.BUDGETID, {
    password: process.env.BUDGETPASS,
  });

  // Open the buckets file to be imported (sqlite file)
  const database = new DatabaseSync("./backup.buckets");

  // Get accounts from buckets and transform into key value object
  const getAccounts = database.prepare(
    `SELECT id, name, starting_balance FROM account;`
  );
  const accounts = {};
  for (const obj of getAccounts.all()) {
    accounts[obj.id] = { name: obj.name, initial: obj.starting_balance };
  }
  // Create accounts in actual and save the actual account id
  for (const [id, account] of Object.entries(accounts)) {
    // TODO Check if account already in list (helps w/ dev)
    account["actualId"] = await api.createAccount(
      { name: account.name, type: "other" },
      account.initial
    );
  }

  console.log(accounts);

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
