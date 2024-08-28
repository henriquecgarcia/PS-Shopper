var SQLite = require(".");

var connection = SQLite.open({
    Database: 'test.sqlite'
});

function handleError(error) {
    console.log("ERROR:", error);
    process.exit(1);
}

connection.query("SELECT * FROM states WHERE State = 'South Dakota'").then((data) => {
    if (data.length != 1) {
        handleError(new Error("Invalid data returned"));
    }
    connection.close().then(() => {
        process.exit(0);
    }).catch(handleError);
}).catch(handleError);
