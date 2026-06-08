CREATE TABLE IF NOT EXISTS `dashboard_access_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guild_id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dashboard_access_roles_guild_id_role_id_key`(`guild_id`, `role_id`),
    INDEX `dashboard_access_roles_guild_id_idx`(`guild_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
