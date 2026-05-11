CREATE TABLE IF NOT EXISTS `project_global_secrets` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `encryptedValue` TEXT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `project_global_secrets_projectId_key_key`(`projectId`, `key`),
    INDEX `project_global_secrets_projectId_idx`(`projectId`),
    CONSTRAINT `project_global_secrets_projectId_fkey`
      FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `project_memories` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `memoryType` VARCHAR(50) NOT NULL,
    `title` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `summary` TEXT NULL,
    `metadata` JSON NULL,
    `sourceArtifactId` VARCHAR(191) NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `project_memories_projectId_memoryType_createdAt_idx`(`projectId`, `memoryType`, `createdAt`),
    CONSTRAINT `project_memories_projectId_fkey`
      FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `project_memories_createdByUserId_fkey`
      FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
