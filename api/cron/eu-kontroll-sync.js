'use strict';

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runEuKontrollSyncCron } = require('../../server/cron-eu-kontroll-sync');

module.exports = function euKontrollSyncCronHandler(req, res) {
  return runEuKontrollSyncCron(req, res);
};
