const crypto = require('crypto');
require('dotenv').config();

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp, 'utf8').digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(regionName, 'utf8').digest();
  const kService = crypto.createHmac('sha256', kRegion).update(serviceName, 'utf8').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request', 'utf8').digest();
  return kSigning;
}

function generateToken() {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';
  
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
  const dateStamp = amzDate.substring(0, 8);
  
  const host = 'bedrock.amazonaws.com';
  const urlPath = '/';
  // Note: Action=CallWithBearerToken goes first alphabetically, then X-Amz-Algorithm ...
  const credentialScope = `${dateStamp}/${region}/bedrock/aws4_request`;
  let canonicalQueryString = [
    `Action=CallWithBearerToken`,
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(accessKey + '/' + credentialScope)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=43200`,
    `X-Amz-SignedHeaders=host`
  ].join('&');
  
  const canonicalRequest = `GET\n${urlPath}\n${canonicalQueryString}\nhost:${host}\n\nhost\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`;
  
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')}`;
  
  const signingKey = getSignatureKey(secretKey, dateStamp, region, 'bedrock');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  
  canonicalQueryString += `&X-Amz-Signature=${signature}`;
  
  const signedUrl = `bedrock.amazonaws.com/?${canonicalQueryString}`;
  return 'bedrock-api-key-' + Buffer.from(signedUrl).toString('base64');
}

console.log(generateToken());
