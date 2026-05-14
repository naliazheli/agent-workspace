ALTER TABLE `project_access_grants`
  ADD COLUMN `capability_bundle_refs` JSON NULL AFTER `skill_bundle_refs`;

CREATE TABLE `project_capability_bundle_installations` (
  `id` VARCHAR(191) NOT NULL,
  `project_id` VARCHAR(191) NOT NULL,
  `bundle_ref` VARCHAR(191) NOT NULL,
  `manifest_snapshot` JSON NOT NULL,
  `discoverability` VARCHAR(191) NOT NULL DEFAULT 'PRIVATE',
  `share_targets` JSON NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  `installed_by_member_id` VARCHAR(191) NULL,
  `installed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `uniq_pcb_project_bundle` (`project_id`, `bundle_ref`),
  INDEX `idx_pcb_project_status` (`project_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_capability_bundle_installations`
  ADD CONSTRAINT `fk_pcb_project`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
