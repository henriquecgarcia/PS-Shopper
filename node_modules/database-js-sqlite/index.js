var sqlite = require('sql.js');
var debug = require('debug')('database-js-sqlite');
const fs = require('fs');

var sqlite3 = require('sqlite3');
const Common = require('database-js-common');

var m_database = Symbol('database');
var m_filename = Symbol('filename');
var m_transaction = Symbol('transaction');

class SQLite {
    constructor(database) {
        if (database) {
            this[m_filename] = database;
            if (fs.existsSync(database)) {
                this[m_database] = new sqlite.Database(fs.readFileSync(database));
            } else {
                this[m_database] = new sqlite.Database();
            }
        } else {
            this[m_database] = new sqlite.Database();
            this[m_filename] = null;
        }
        this[m_transaction] = false;
    }

    query(sql) {
        var self = this;
        return new Promise((resolve, reject) => {
            let data = self[m_database].exec(sql);
            let results = [];

            debug('Query: %s', sql);
            debug('Data: %o', data);

            if (data.length === 0) {
                debug('No results from query');
                return resolve(results);
            }
            if (data.length != 1) {
                debug('Invalid data returned');
                return reject("Invalid data returned");
            }
            data = data[0];
            for (let value of data.values) {
                let row = {};
                for (let n = 0; n < data.columns.length; n++) {
                    row[data.columns[n]] = value[n];
                }
                results.push(row);
            }
            self.flush().then(() => {
                debug('Results: %o', results);
                resolve(results);
            }).catch(reason => reject(reason));
        });
    }

    execute(sql) {
        var self = this;
        return new Promise((resolve, reject) => {
            try {
                self[m_database].run(sql);
                debug('Statement: %s', sql);

                self.flush().then(() => {
                    resolve();
                }).catch(reason => reject(reason));
            } catch (error) {
                reject(error);
            }
        });
    }

    close() {
        return this.flush();
    }

    flush() {
        var self = this;
        return new Promise((resolve, reject) => {
            if (self[m_filename]) {
                fs.writeFile(self[m_filename], new Buffer(self[m_database].export()), (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    isTransactionSupported() {
        return true;
    }

    inTransaction() {
        return this[m_transaction];
    }

    beginTransaction() {
        var self = this;
        if (this.inTransaction() == true) {
            return Promise.resolve(false);
        }
        return new Promise((resolve, reject) => {
            this.execute('BEGIN')
            .then(() => {
                self[m_transaction] = true;
                resolve(true);
            })
            .catch(error => {
                reject(error);
            });
        });
    }

    commit() {
        var self = this;
        if (this.inTransaction() == false) {
            return Promise.resolve(false);
        }
        return new Promise((resolve, reject) => {
            this.execute('COMMIT')
            .then(() => {
                self[m_transaction] = false;
                resolve(true);
            })
            .catch(error => {
                reject(error);
            })
        });
    }

    rollback() {
        var self = this;
        if (this.inTransaction() == false) {
            return Promise.resolve(false);
        }
        return new Promise((resolve, reject) => {
            this.execute('ROLLBACK')
            .then(() => {
                self[m_transaction] = false;
                resolve(true);
            })
            .catch(error => {
                reject(error);
            })
        });
    }
}


class SQLite3 {
    constructor(database) {
        if (database) {
            this.__database = new sqlite3.Database(database);
        } else {
            this.__database = new sqlite3.Database(':memory:');
        }
        this.__transaction = false;
    }

    query(sql) {
        debug('Query: %s', sql);
    
        return new Promise((resolve, reject) => {
            this.__database.all(sql, (err, rows) => {
                if (err) {
                    return reject(err);
                }
                debug('Data: %o', rows);
                return resolve(rows);
            });
        });
    }

    execute(sql) {
        debug('Execute: %s', sql);

    return new Promise((resolve, reject) => {
            this.__database.exec(sql, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.__database.close((err) => {
                if (err) {
                    return reject(err);
                }
                resolve(true);
            });
        });
    }

    isTransactionSupported() {
        return true;
    }

    inTransaction() {
        return this.__transaction;
    }

    beginTransaction() {
        if (this.inTransaction() == true) {
            return Promise.resolve(false);
        }
        return new Promise((resolve, reject) => {
            this.execute('BEGIN')
            .then(() => {
                this.__transaction = true;
                resolve(true);
            })
            .catch(error => {
                reject(error);
            });
        });
    }

    commit() {
        if (this.inTransaction() == false) {
            return Promise.resolve(false);
        }
        return new Promise((resolve, reject) => {
            this.execute('COMMIT')
            .then(() => {
                this.__transaction = false;
                resolve(true);
            })
            .catch(error => {
                reject(error);
            })
        });
    }

    rollback() {
        if (this.inTransaction() == false) {
            return Promise.resolve(false);
        }
        return new Promise((resolve, reject) => {
            this.execute('ROLLBACK')
            .then(() => {
                this.__transaction = false;
                resolve(true);
            })
            .catch(error => {
                reject(error);
            })
        });
    }
}

module.exports = {
    open: function(connection) {
        let useSqlite3 = true;
        if (connection.Parameters) {
            let params = Common.parseConnectionParams(connection.Parameters);
            if (("driver" in params == true) && (params.driver === "sql.js")) {
                useSqlite3 = false;
            }
        }
        if (useSqlite3 == true) {
            return new SQLite3(connection.Database);
        } else {
            return new SQLite(connection.Database);
        }
    }
};