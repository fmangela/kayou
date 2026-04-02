import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { getPool } from '../../lib/database.js';

const assetsRoot = fileURLToPath(new URL('../../../../../assets', import.meta.url));
const sourceDir = path.join(assetsRoot, 'card_original_image');
const outputDir = path.join(assetsRoot, 'cards');

export interface CardImageConversionItem {
  sourceFileName: string;
  outputFileName: string;
  outputRelativePath: string;
}

export interface CardImageConversionFailure {
  sourceFileName: string;
  message: string;
}

export interface CardImageConversionReport {
  sourceDirectory: string;
  outputDirectory: string;
  scannedPngCount: number;
  convertedCount: number;
  deletedSourceCount: number;
  converted: CardImageConversionItem[];
  failures: CardImageConversionFailure[];
}

function isPngFile(fileName: string) {
  return path.extname(fileName).toLowerCase() === '.png';
}

export function getAssetsRootPath() {
  return assetsRoot;
}

export async function convertCardImagesToWebp(adminId: number) {
  await mkdir(sourceDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const fileNames = await readdir(sourceDir);
  const pngFiles = fileNames.filter(isPngFile).sort((left, right) =>
    left.localeCompare(right, 'zh-CN'),
  );
  const report: CardImageConversionReport = {
    sourceDirectory: sourceDir,
    outputDirectory: outputDir,
    scannedPngCount: pngFiles.length,
    convertedCount: 0,
    deletedSourceCount: 0,
    converted: [],
    failures: [],
  };

  for (const fileName of pngFiles) {
    const sourcePath = path.join(sourceDir, fileName);
    const outputFileName = `${path.parse(fileName).name}.webp`;
    const outputPath = path.join(outputDir, outputFileName);

    try {
      await rm(outputPath, { force: true });
      await sharp(sourcePath)
        .webp({
          quality: 92,
          effort: 5,
        })
        .toFile(outputPath);
      await rm(sourcePath, { force: true });

      report.convertedCount += 1;
      report.deletedSourceCount += 1;
      report.converted.push({
        sourceFileName: fileName,
        outputFileName,
        outputRelativePath: `/assets/cards/${outputFileName}`,
      });
    } catch (error) {
      report.failures.push({
        sourceFileName: fileName,
        message: error instanceof Error ? error.message : '未知转换错误',
      });
    }
  }

  await getPool().execute(
    `
      INSERT INTO operation_logs (
        admin_id,
        action_type,
        target_type,
        target_id,
        action_payload,
        ip_address
      )
      VALUES (?, 'assets.card_image.convert', 'card_assets', 'batch', ?, '127.0.0.1')
    `,
    [
      adminId,
      JSON.stringify({
        scannedPngCount: report.scannedPngCount,
        convertedCount: report.convertedCount,
        deletedSourceCount: report.deletedSourceCount,
        failures: report.failures,
      }),
    ],
  );

  return report;
}
