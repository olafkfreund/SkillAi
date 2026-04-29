-- Migration: customer-specific role ID
-- Adds roles.customer_role_id (the value) and customers.role_id_label (per-customer label).
-- Both nullable, no default — pure additive ALTER TABLE, safe under load.

ALTER TABLE roles ADD COLUMN customer_role_id varchar(100);
ALTER TABLE customers ADD COLUMN role_id_label varchar(60);

CREATE INDEX roles_customer_role_id_idx ON roles (tenant_id, customer_role_id);
