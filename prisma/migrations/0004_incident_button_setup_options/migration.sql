ALTER TABLE `incident_buttons`
    ADD COLUMN `incident_category_id` VARCHAR(191) NULL,
    ADD COLUMN `steward_role_ids` JSON NULL;

UPDATE `incident_buttons`
SET `steward_role_ids` = JSON_ARRAY()
WHERE `steward_role_ids` IS NULL;

ALTER TABLE `incident_buttons`
    MODIFY COLUMN `steward_role_ids` JSON NOT NULL;

ALTER TABLE `incidents`
    ADD COLUMN `incident_number` INTEGER NULL;
