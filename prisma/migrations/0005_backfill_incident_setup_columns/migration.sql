SET @schema_name = DATABASE();

SET @column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'incident_buttons'
        AND COLUMN_NAME = 'incident_category_id'
);
SET @statement = IF(
    @column_exists = 0,
    'ALTER TABLE `incident_buttons` ADD COLUMN `incident_category_id` VARCHAR(191) NULL',
    'SET @noop = 1'
);
PREPARE stmt FROM @statement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'incident_buttons'
        AND COLUMN_NAME = 'steward_role_ids'
);
SET @statement = IF(
    @column_exists = 0,
    'ALTER TABLE `incident_buttons` ADD COLUMN `steward_role_ids` JSON NULL',
    'SET @noop = 1'
);
PREPARE stmt FROM @statement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'incident_buttons'
        AND COLUMN_NAME = 'channel_role_ids'
);
SET @statement = IF(
    @column_exists = 0,
    'ALTER TABLE `incident_buttons` ADD COLUMN `channel_role_ids` JSON NULL',
    'SET @noop = 1'
);
PREPARE stmt FROM @statement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'incident_buttons'
        AND COLUMN_NAME = 'add_reporter_to_channel'
);
SET @statement = IF(
    @column_exists = 0,
    'ALTER TABLE `incident_buttons` ADD COLUMN `add_reporter_to_channel` BOOLEAN NOT NULL DEFAULT false',
    'SET @noop = 1'
);
PREPARE stmt FROM @statement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'incident_buttons'
        AND COLUMN_NAME = 'button_message'
);
SET @statement = IF(
    @column_exists = 0,
    'ALTER TABLE `incident_buttons` ADD COLUMN `button_message` TEXT NULL',
    'SET @noop = 1'
);
PREPARE stmt FROM @statement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `incident_buttons`
SET `steward_role_ids` = JSON_ARRAY()
WHERE `steward_role_ids` IS NULL;

UPDATE `incident_buttons`
SET `channel_role_ids` = JSON_ARRAY()
WHERE `channel_role_ids` IS NULL;

UPDATE `incident_buttons`
SET `button_message` = 'Click the button below to report an incident. You will be asked to provide details.'
WHERE `button_message` IS NULL;

ALTER TABLE `incident_buttons`
    MODIFY COLUMN `steward_role_ids` JSON NOT NULL,
    MODIFY COLUMN `channel_role_ids` JSON NOT NULL,
    MODIFY COLUMN `button_color` VARCHAR(191) NOT NULL DEFAULT 'Red',
    MODIFY COLUMN `button_message` TEXT NOT NULL;

SET @column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'incidents'
        AND COLUMN_NAME = 'incident_number'
);
SET @statement = IF(
    @column_exists = 0,
    'ALTER TABLE `incidents` ADD COLUMN `incident_number` INTEGER NULL',
    'SET @noop = 1'
);
PREPARE stmt FROM @statement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'incidents'
        AND COLUMN_NAME = 'steward_role_ids'
);
SET @statement = IF(
    @column_exists = 0,
    'ALTER TABLE `incidents` ADD COLUMN `steward_role_ids` JSON NULL',
    'SET @noop = 1'
);
PREPARE stmt FROM @statement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `incidents`
SET `steward_role_ids` = JSON_ARRAY()
WHERE `steward_role_ids` IS NULL;

ALTER TABLE `incidents`
    MODIFY COLUMN `steward_role_ids` JSON NOT NULL;
