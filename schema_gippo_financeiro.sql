-- Schema inicial - Gippo Financeiro
-- MySQL 8.0+ (Cloud SQL)

-- Recomendado: rodar como usuário com permissão de CREATE/ALTER.

CREATE DATABASE IF NOT EXISTS gippo_financeiro
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE gippo_financeiro;

-- Para consistência de timestamps
SET time_zone = '+00:00';

-- ==============================
-- users
-- ==============================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ==============================
-- accounts
-- ==============================
CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  bank_code VARCHAR(20) NULL,
  initial_balance_cents BIGINT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_accounts_user_active (user_id, is_active),
  UNIQUE KEY uq_accounts_user_name (user_id, name),
  CONSTRAINT fk_accounts_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ==============================
-- categories
-- ==============================
CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  type ENUM('income', 'expense', 'both') NOT NULL DEFAULT 'both',
  color VARCHAR(16) NULL,
  icon VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_user_name (user_id, name),
  KEY ix_categories_user_type (user_id, type),
  CONSTRAINT fk_categories_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ==============================
-- transactions
-- ==============================
CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  type ENUM('income', 'expense') NOT NULL,
  status ENUM('pending', 'paid', 'overdue', 'canceled') NOT NULL DEFAULT 'pending',
  description VARCHAR(255) NOT NULL,
  amount_cents BIGINT UNSIGNED NOT NULL,
  due_date DATE NOT NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_tx_user_due (user_id, due_date),
  KEY ix_tx_user_status_due (user_id, status, due_date),
  KEY ix_tx_user_account_due (user_id, account_id, due_date),
  KEY ix_tx_user_category_due (user_id, category_id, due_date),
  CONSTRAINT fk_tx_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_tx_account
    FOREIGN KEY (account_id) REFERENCES accounts(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_tx_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT chk_tx_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT chk_tx_paid_at_consistency CHECK (
    (status = 'paid' AND paid_at IS NOT NULL)
    OR (status <> 'paid' AND paid_at IS NULL)
  )
) ENGINE=InnoDB;

-- ==============================
-- recurrence_rules (opcional)
-- ==============================
CREATE TABLE IF NOT EXISTS recurrence_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  type ENUM('income', 'expense') NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount_cents BIGINT UNSIGNED NOT NULL,
  frequency ENUM('weekly', 'monthly', 'yearly') NOT NULL DEFAULT 'monthly',
  interval_count INT UNSIGNED NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  next_run_date DATE NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_rr_user_active_next (user_id, is_active, next_run_date),
  KEY ix_rr_user_account (user_id, account_id),
  CONSTRAINT fk_rr_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_rr_account
    FOREIGN KEY (account_id) REFERENCES accounts(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_rr_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT chk_rr_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT chk_rr_interval_positive CHECK (interval_count >= 1)
) ENGINE=InnoDB;

-- ==============================
-- Views úteis (opcionais)
-- ==============================
-- Saldo por conta baseado apenas em transações pagas.
-- Se você preferir considerar income/expense "paid" como movimentação real, isso facilita.
CREATE OR REPLACE VIEW v_account_balance AS
SELECT
  a.id AS account_id,
  a.user_id,
  a.name,
  a.initial_balance_cents
  + COALESCE(SUM(CASE
      WHEN t.status = 'paid' AND t.type = 'income' THEN t.amount_cents
      WHEN t.status = 'paid' AND t.type = 'expense' THEN -t.amount_cents
      ELSE 0
    END), 0) AS balance_cents
FROM accounts a
LEFT JOIN transactions t
  ON t.account_id = a.id
  AND t.user_id = a.user_id
GROUP BY a.id, a.user_id, a.name, a.initial_balance_cents;

-- ==============================
-- Seed mínimo (opcional)
-- ==============================
-- INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', 'admin@local', NULL, 'admin');
