const https = require('https');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const readline = require('readline');

const S3_URL = 'https://mcp-rlp.s3.us-east-2.amazonaws.com/insights.sqlite.gz';
const GZIP_FILENAME = 'insights.sqlite.gz';
const DB_FILENAME = 'insights.sqlite';
const GZIP_SIZE_MB = 400;
const DB_SIZE_GB = 2.5;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n📥 Starting download from: ${url}`);
    console.log(`📁 Saving to: ${outputPath}\n`);

    const file = fs.createWriteStream(outputPath);
    let downloadedBytes = 0;
    let lastProgress = 0;

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        file.close();
        fs.unlinkSync(outputPath);
        return downloadFile(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
      }

      const totalBytes = parseInt(response.headers['content-length'], 10);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = Math.floor((downloadedBytes / totalBytes) * 100);

        // Update progress every 5%
        if (progress >= lastProgress + 5 || progress === 100) {
          process.stdout.write(
            `\r📊 Progress: ${progress}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`
          );
          lastProgress = progress;
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('\n✅ Download complete!\n');
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(outputPath);
      reject(err);
    });

    file.on('error', (err) => {
      file.close();
      fs.unlinkSync(outputPath);
      reject(err);
    });
  });
}

async function extractGzipFile(gzipPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`📦 Extracting ${path.basename(gzipPath)}...`);
    console.log(`📁 Output: ${outputPath}\n`);

    const gzipStream = fs.createReadStream(gzipPath);
    const gunzip = zlib.createGunzip();
    const outputStream = fs.createWriteStream(outputPath);

    let extractedBytes = 0;
    let lastProgress = 0;

    gunzip.on('data', (chunk) => {
      extractedBytes += chunk.length;
      const progress = Math.floor(extractedBytes / (1024 * 1024));

      // Update progress every 100MB
      if (progress >= lastProgress + 100) {
        process.stdout.write(`\r📊 Extracted: ${formatBytes(extractedBytes)}`);
        lastProgress = progress;
      }
    });

    gzipStream
      .pipe(gunzip)
      .pipe(outputStream)
      .on('finish', () => {
        console.log(`\r📊 Extracted: ${formatBytes(extractedBytes)}`);
        console.log('\n✅ Extraction complete!\n');
        resolve();
      })
      .on('error', (err) => {
        outputStream.close();
        reject(err);
      });

    gzipStream.on('error', (err) => {
      outputStream.close();
      reject(err);
    });

    gunzip.on('error', (err) => {
      outputStream.close();
      reject(err);
    });
  });
}

async function main() {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('🗄️  Database Initialization Script');
    console.log('='.repeat(70));
    console.log('\n⚠️  WARNING: This script will download a large database file.');
    console.log(`    • Compressed size: ~${GZIP_SIZE_MB} MB`);
    console.log(`    • Extracted size: ~${DB_SIZE_GB} GB`);
    console.log(`    • Source: ${S3_URL}`);
    console.log(`    • Destination: ${path.resolve(DB_FILENAME)}`);
    console.log();

    const answer = await prompt('Do you want to continue? (yes/no): ');

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n❌ Operation cancelled by user.\n');
      rl.close();
      process.exit(0);
    }

    rl.close();

    const gzipPath = path.join(__dirname, GZIP_FILENAME);
    const dbPath = path.join(__dirname, DB_FILENAME);

    // Check if database already exists
    if (fs.existsSync(dbPath)) {
      console.log(`\n⚠️  Database file already exists at: ${dbPath}`);
      console.log('Please delete it manually if you want to re-initialize.\n');
      process.exit(1);
    }

    // Download the gzipped file
    await downloadFile(S3_URL, gzipPath);

    // Extract the gzipped file
    await extractGzipFile(gzipPath, dbPath);

    // Delete the gzip file
    console.log(`🗑️  Cleaning up: Deleting ${GZIP_FILENAME}...`);
    fs.unlinkSync(gzipPath);
    console.log('✅ Cleanup complete!\n');

    console.log('='.repeat(70));
    console.log('🎉 Database initialization complete!');
    console.log(`📁 Database location: ${dbPath}`);
    console.log('='.repeat(70));
    console.log();

  } catch (error) {
    console.error('\n❌ Error during initialization:', error.message);

    // Cleanup on error
    const gzipPath = path.join(__dirname, GZIP_FILENAME);
    const dbPath = path.join(__dirname, DB_FILENAME);

    if (fs.existsSync(gzipPath)) {
      console.log('🗑️  Cleaning up temporary files...');
      fs.unlinkSync(gzipPath);
    }

    if (fs.existsSync(dbPath)) {
      console.log('🗑️  Cleaning up partial extraction...');
      fs.unlinkSync(dbPath);
    }

    console.log();
    process.exit(1);
  }
}

main();
