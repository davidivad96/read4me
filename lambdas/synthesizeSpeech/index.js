import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const pollyClient = new PollyClient({ region: process.env.CDK_DEPLOY_REGION });
const s3Client = new S3Client({ region: process.env.CDK_DEPLOY_REGION });

const handler = async (event) => {
  const { AudioStream } = await pollyClient.send(
    new SynthesizeSpeechCommand({
      OutputFormat: "mp3",
      Text: event.detectDocumentTextResult.Text,
      VoiceId: event.getVoiceIdResult.VoiceId,
    })
  );
  const Bucket = event.bucketName;
  const Key = `audios/${event.objectKey
    .replace("documents/", "")
    .toLowerCase()
    .replace(/[^a-zA-Z\d]/g, "_")}.mp3`;
  const upload = new Upload({
    client: s3Client,
    params: { Body: AudioStream, Bucket, Key },
  });
  await upload.done();
  const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket, Key }), {
    expiresIn: 3600,
  });
  return signedUrl;
};

export { handler };
