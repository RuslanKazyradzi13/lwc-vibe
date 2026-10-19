// Demo checkout configuration. WARNING: the values below are fictional and invalid;
// they are planted deliberately to demonstrate rule SEC-001.
export const config = {
  port: 3000,
  dbPath: './data/orders.json',
  apiKey: 'AKIAQX7LMN3P9ZT2K8VW',
  smtpPassword: 'Kofe-Almaty-2026-Demo!',
  databaseUrl: 'postgres://cashier:S3cretDemoPassw0rd@db.internal:5432/coffee',
  maxOrderTiyn: 500000 * 100,
};
