import { TextractClient, GetDocumentTextDetectionCommand } from "@aws-sdk/client-textract";

const textractClient = new TextractClient({ region: process.env.CDK_DEPLOY_REGION });

class NoTextFound extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

const handler = async (event) => {
  const { Blocks } = await textractClient.send(
    new GetDocumentTextDetectionCommand({
      JobId: event.JobId,
    })
  );
  const text = Blocks.reduce(
    (acc, curr) => (curr.BlockType === "LINE" && curr.Text ? `${acc.concat(curr.Text)} ` : acc),
    ""
  );
  if (text.length === 0) {
    throw new NoTextFound("No text was found in the document");
  }
  return text;
};

export { handler };
