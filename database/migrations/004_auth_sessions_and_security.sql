-- Phase 05: credential identities, revocable sessions, invitations, rate limits and security events.
-- MySQL 8.0+ / InnoDB. Forward-only; do not edit migrations 001–003 after they are recorded.

ALTER TABLE app_users
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER provider_subject,
  ADD KEY ix_app_users_account_status (account_status, updated_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  csrf_token_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  revoked_reason VARCHAR(80) NULL,
  source_ip_hash CHAR(64) NULL,
  user_agent_hash CHAR(64) NULL,
  UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
  KEY ix_auth_sessions_user_active (user_id, revoked_at, expires_at),
  KEY ix_auth_sessions_expiry (expires_at, revoked_at),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT ck_auth_session_time CHECK (expires_at > created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS account_invitation_tokens (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_invitation_token_hash (token_hash),
  KEY ix_invitation_user_state (user_id, consumed_at, revoked_at, expires_at),
  CONSTRAINT fk_invitation_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_invitation_creator FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key CHAR(64) NOT NULL PRIMARY KEY,
  scope_type ENUM('EMAIL','IP','INVITATION') NOT NULL,
  window_started_at DATETIME(3) NOT NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  blocked_until DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_auth_rate_limits_cleanup (updated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS security_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NULL,
  event_type VARCHAR(80) NOT NULL,
  outcome ENUM('SUCCESS','FAILURE','BLOCKED') NOT NULL,
  subject_hash CHAR(64) NULL,
  source_ip_hash CHAR(64) NULL,
  user_agent_hash CHAR(64) NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_security_events_user_time (user_id, created_at),
  KEY ix_security_events_type_time (event_type, created_at),
  KEY ix_security_events_subject_time (subject_hash, created_at),
  CONSTRAINT fk_security_events_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
