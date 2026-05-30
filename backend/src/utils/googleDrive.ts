import crypto from 'crypto';
import fs from 'fs';
import { setupLogger } from './logger';

const logger = setupLogger('Google-Drive-Бэкап');

interface GoogleCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

/**
 * Extracts Google Drive Folder ID from a sharing link or accepts it directly if it's already an ID.
 * Supports links:
 * - https://drive.google.com/drive/folders/FOLDER_ID
 * - https://drive.google.com/drive/u/0/folders/FOLDER_ID
 * - Plain ID: 12345abcdef...
 */
export function extractFolderId(urlOrId: string): string {
  if (!urlOrId) return '';
  
  // Regular expression to match standard folder link structure
  const folderMatch = urlOrId.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (folderMatch) {
    return folderMatch[1];
  }
  
  // If it's a plain alphanumeric string containing dashes/underscores, assume it's the folder ID itself
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9-_]+$/.test(trimmed)) {
    return trimmed;
  }
  
  return '';
}

/**
 * Encodes string to Base64URL format (standard JWT format).
 */
function base64UrlEncode(str: string | Buffer): string {
  const buf = typeof str === 'string' ? Buffer.from(str) : str;
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Generates a signed JWT for Google Service Account authentication.
 */
function generateJwtAssertion(clientEmail: string, privateKey: string): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, // Token valid for 1 hour
    iat: now
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signInput = `${headerEncoded}.${payloadEncoded}`;

  // Sign using native Node.js crypto module (RSA-SHA256)
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  const signatureEncoded = base64UrlEncode(signer.sign(privateKey));

  return `${signInput}.${signatureEncoded}`;
}

/**
 * Exchanges signed JWT assertion for Google Access Token.
 */
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const jwtAssertion = generateJwtAssertion(clientEmail, privateKey);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtAssertion
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`Ошибка при получении OAuth2 токена от Google: ${errorText}`);
    throw new Error(`Ошибка авторизации Google: ${errorText}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

/**
 * Uploads a local file to a specified Google Drive Folder using Service Account credentials.
 * @param filePath Full path to the file to upload
 * @param fileName Target name of the file on Google Drive
 * @param folderLink Google Drive folder link or folder ID
 * @param credentialsJson JSON string containing Service Account credentials
 * @returns Web content link or confirmation message
 */
export async function uploadToGoogleDrive(
  filePath: string,
  fileName: string,
  folderLink: string,
  credentialsJson: string
): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл не найден по пути: ${filePath}`);
  }

  if (!folderLink.trim()) {
    throw new Error('Ссылка на папку Google Drive пуста.');
  }

  if (!credentialsJson.trim()) {
    throw new Error('Ключ Сервисного аккаунта Google или URL Web App пуст.');
  }

  // 1. If credentials start with HTTP/HTTPS, treat as Google Apps Script Web App URL
  const trimmedCreds = credentialsJson.trim();
  if (trimmedCreds.startsWith('http://') || trimmedCreds.startsWith('https://')) {
    logger.info(`Начало загрузки через Google Apps Script Web App. Файл: ${fileName}`);
    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString('base64');
    const folderId = extractFolderId(folderLink);

    const payload = {
      folderId,
      fileName,
      fileContent: base64Data
    };

    const response = await fetch(trimmedCreds, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Ошибка Google Apps Script Web App (${response.status}): ${errorText}`);
      throw new Error(`Ошибка Google Apps Script Web App (${response.status}): ${errorText}`);
    }

    const result = await response.json() as { success: boolean; message?: string; error?: string };
    if (!result.success) {
      logger.error(`Ошибка выполнения в Google Apps Script: ${result.error}`);
      throw new Error(result.error || 'Неизвестная ошибка выполнения внутри Google Apps Script');
    }

    logger.info(`Файл бэкапа успешно загружен через Apps Script Web App. Сообщение: ${result.message}`);
    return result.message || `Файл "${fileName}" успешно выгружен на Google Диск через Apps Script`;
  }

  // 2. Otherwise, perform standard Google Service Account upload
  let credentials: GoogleCredentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch (err: any) {
    throw new Error(`Данные авторизации невалидны. Это должен быть либо URL-адрес Google Apps Script Web App (начинающийся с https://), либо валидный JSON-ключ Сервисного аккаунта: ${err.message}`);
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('JSON Сервисного аккаунта поврежден: отсутствуют поля client_email или private_key.');
  }

  // 2. Extract Folder ID
  const folderId = extractFolderId(folderLink);
  if (!folderId) {
    throw new Error('Не удалось извлечь Folder ID из предоставленной ссылки на Google Drive.');
  }

  logger.info(`Начало загрузки бэкапа в Google Drive. Файл: ${fileName}, Папка: ${folderId}`);

  // 3. Authenticate with Google
  const accessToken = await getAccessToken(credentials.client_email, credentials.private_key);

  // 4. Read File Data
  const fileData = fs.readFileSync(filePath);

  // 5. Construct Multipart/Related Request Body
  const boundary = `-------QMS_Backup_Boundary_${Date.now().toString(16)}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--\r\n`;

  const metadata = {
    name: fileName,
    parents: [folderId]
  };

  const metadataPart = 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n';
  const mediaPartHeaders = 'Content-Type: application/octet-stream\r\n\r\n';

  const multipartBody = Buffer.concat([
    Buffer.from(delimiter + metadataPart + delimiter + mediaPartHeaders),
    fileData,
    Buffer.from(closeDelimiter)
  ]);

  // 6. Execute Upload Request
  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': multipartBody.length.toString()
    },
    body: multipartBody
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`Ошибка при загрузке файла на Google Drive: ${errorText}`);
    
    if (response.status === 404) {
      throw new Error(`Папка Google Drive (ID: ${folderId}) не найдена. Проверьте правильность ссылки.`);
    } else if (response.status === 403) {
      throw new Error(`Доступ запрещен. Убедитесь, что папка на Google Drive предоставлена сервисным аккаунтом как "Редактор" (Editor) для почты: ${credentials.client_email}`);
    }
    
    throw new Error(`Ошибка Google Drive API (${response.status}): ${errorText}`);
  }

  const result = await response.json() as { id: string; name: string };
  logger.info(`Файл бэкапа успешно загружен на Google Drive. Имя: ${result.name}, ID: ${result.id}`);
  
  return `Файл "${result.name}" успешно загружен на Google Drive (ID: ${result.id})`;
}
