import { useState } from "react";
import { S3Client, PutObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { SFNClient, StartSyncExecutionCommand, SFNServiceException } from "@aws-sdk/client-sfn";
import { FileUploader } from "react-drag-drop-files";
import ReactAudioPlayer from "react-audio-player";
import Spinner from "./components/Spinner";
import "./App.css";

const bucketName = process.env.REACT_APP_BUCKET_NAME;
const stateMachineArn = process.env.REACT_APP_STATE_MACHINE_ARN;
const fileTypes = ["PNG", "JPG", "JPEG"];

const s3Client = new S3Client({
  region: process.env.REACT_APP_AWS_REGION,
  credentials: {
    accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY!,
  },
});
const sfnClient = new SFNClient({
  region: process.env.REACT_APP_AWS_REGION,
  credentials: {
    accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY!,
  },
});

type Status = "PROCESSING" | "COMPLETED" | "ERROR";

const App = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [text, setText] = useState<string | undefined>();
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const handleChange = (file: File) => setFile(file);

  const handleSubmit = async () => {
    try {
      setStatus("PROCESSING");
      const objectKey = `documents/${file!.name}`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
          Body: file!,
        })
      );
      const {
        status: sfnStatus,
        error,
        output,
      } = await sfnClient.send(
        new StartSyncExecutionCommand({
          input: JSON.stringify({ bucketName, objectKey }),
          stateMachineArn,
        })
      );
      if (sfnStatus === "FAILED" || sfnStatus === "TIMED_OUT" || sfnStatus === "ABORTED") {
        setStatus("ERROR");
        setErrorMsg(error);
        return;
      }
      setStatus("COMPLETED");
      const {
        detectDocumentTextResult: { Text },
        synthesizeSpeechResult: { SignedUrl },
      } = JSON.parse(output!);
      setText(Text);
      setAudioUrl(SignedUrl);
      setErrorMsg(error);
    } catch (error) {
      console.log(error);
      setStatus("ERROR");
      setErrorMsg(
        error instanceof S3ServiceException || error instanceof SFNServiceException
          ? error.message
          : "Unexpected error"
      );
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1 className="App-title">READ FOR ME!</h1>
      </header>
      <div className="App-body">
        <div className="App-content">
          <h3 className="App-subtitle">
            Select a document that contains text and you'll be able to hear it in a few seconds!
          </h3>
          <FileUploader
            classes="file-uploader"
            handleChange={handleChange}
            name="file"
            types={fileTypes}
          />
          <button
            className="App-button"
            onClick={handleSubmit}
            disabled={!file || status === "PROCESSING"}
          >
            Submit!
          </button>
          {status === "PROCESSING" ? (
            <Spinner />
          ) : status === "ERROR" ? (
            <p className="status-error">Error: {errorMsg}</p>
          ) : status === "COMPLETED" ? (
            <>
              <p className="status-success">Completed</p>
              <ReactAudioPlayer src={audioUrl} autoPlay controls />
              <p>{text}</p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default App;
