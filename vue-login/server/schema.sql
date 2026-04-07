CREATE DATABASE IF NOT EXISTS `vue_login`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `vue_login`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(80) NULL,
  `avatar_url` VARCHAR(500) NULL,
  `bio` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_username` (`username`)
);

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `token` VARCHAR(128) NOT NULL,
  `user_id` INT NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_token` (`token`)
);

CREATE TABLE IF NOT EXISTS `feature_pages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(80) NOT NULL,
  `slug` VARCHAR(80) NOT NULL,
  `icon_label` VARCHAR(4) NOT NULL DEFAULT 'FX',
  `description` VARCHAR(255) NULL,
  `content` TEXT NULL,
  `created_by` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_slug` (`slug`)
);

CREATE TABLE IF NOT EXISTS `page_views` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `page_key` VARCHAR(80) NOT NULL,
  `viewed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

INSERT INTO `users` (`username`, `password`, `display_name`, `avatar_url`, `bio`)
VALUES (
  'admin',
  '123456',
  '系统管理员',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
  '负责维护系统公告、功能页和站点总览数据。'
)
ON DUPLICATE KEY UPDATE `username` = VALUES(`username`);
