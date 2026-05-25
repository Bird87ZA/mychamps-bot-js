ALTER TABLE `incident_buttons`
    ADD COLUMN `incident_category_id` VARCHAR(191) NULL,
    ADD COLUMN `steward_role_ids` JSON NULL,
    ADD COLUMN `channel_role_ids` JSON NULL,
    ADD COLUMN `add_reporter_to_channel` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `button_message` TEXT NULL;

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

ALTER TABLE `incidents`
    ADD COLUMN `incident_number` INTEGER NULL,
    ADD COLUMN `steward_role_ids` JSON NULL;

UPDATE `incidents`
SET `steward_role_ids` = JSON_ARRAY()
WHERE `steward_role_ids` IS NULL;

ALTER TABLE `incidents`
    MODIFY COLUMN `steward_role_ids` JSON NOT NULL;
