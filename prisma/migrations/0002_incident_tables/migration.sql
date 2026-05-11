-- CreateTable
CREATE TABLE IF NOT EXISTS `incident_buttons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guild_id` VARCHAR(191) NOT NULL,
    `channel_id` VARCHAR(191) NOT NULL,
    `message_id` VARCHAR(191) NOT NULL,
    `championship_slug` VARCHAR(191) NOT NULL,
    `button_label` VARCHAR(191) NOT NULL DEFAULT 'Report Incident',
    `button_color` VARCHAR(191) NOT NULL DEFAULT 'Danger',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `incident_buttons_message_id_key`(`message_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `incidents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guild_id` VARCHAR(191) NOT NULL,
    `channel_id` VARCHAR(191) NULL,
    `mychamps_incident_id` INTEGER NULL,
    `championship_slug` VARCHAR(191) NOT NULL,
    `defendants` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `defence_submitted` JSON NOT NULL,
    `last_reminder_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
