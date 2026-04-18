-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(191) NOT NULL,
    `discord_id` VARCHAR(191) NOT NULL,
    `is_admin` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `users_username_idx`(`username`),
    INDEX `users_discord_id_idx`(`discord_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commands` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guild_id` BIGINT NOT NULL,
    `channel_id` BIGINT NOT NULL,
    `message_id` BIGINT UNSIGNED NULL,
    `guild_name` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `date_utc` DATETIME(3) NOT NULL,
    `closing_date` DATETIME(3) NULL,
    `closing_date_utc` DATETIME(3) NULL,
    `name` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NULL,
    `time_before` VARCHAR(191) NOT NULL DEFAULT '-6',
    `bot_posted` BOOLEAN NOT NULL DEFAULT false,
    `attendees` JSON NOT NULL,
    `closed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guild_id` BIGINT NOT NULL,
    `channel_id` BIGINT NOT NULL,
    `full_time` BIGINT NOT NULL,
    `reserve` BIGINT NULL,
    `commentator` BIGINT NULL,
    `attendees` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_guild_id_idx`(`guild_id`),
    INDEX `attendance_channel_id_idx`(`channel_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guild_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reminders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `schedule_id` VARCHAR(191) NOT NULL,
    `remind_at` DATETIME(3) NOT NULL,
    `reminded` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `randomisers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guild_id` BIGINT NOT NULL,
    `channel_id` BIGINT NOT NULL,
    `options` JSON NOT NULL,
    `repick` BOOLEAN NOT NULL DEFAULT false,
    `frequency` INTEGER NOT NULL DEFAULT 1,
    `repeat` INTEGER NOT NULL DEFAULT 1,
    `post_at` DATETIME(3) NOT NULL,
    `message` VARCHAR(191) NOT NULL DEFAULT '{{ result }}',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

