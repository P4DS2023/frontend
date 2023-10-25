import { useMemo, useRef, useState } from "react";
import { Socket, io } from "socket.io-client";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

enum RecodingState {
  NOT_STARTED,
  WAITING_FOR_PERMISSION,
  PERMISSION_DENIED,
  RECORDING,
  PROCESSING,
  COMPLETED,
  USE_TEXT_ALTERNATIVE,
  ERROR,
}

interface RecordingSheetProps {
  onSheetClosed: (transcript: string | null) => void;
}

interface TranscriptResponse {
  transcript: string;
  isFinal: boolean;
  speechClarity?: number;
  averageSpeedWPMCurrent?: number;
  averageSpeedWPM?: number;
}

export const RecordingModal = ({ onSheetClosed }: RecordingSheetProps) => {
  const [recordingState, setRecordingState] = useState(
    RecodingState.NOT_STARTED,
  );
  const [currentTranscript, setCurrentTranscript] =
    useState<TranscriptResponse | null>();
  const [transcriptHistory, setTranscriptHistory] = useState<
    TranscriptResponse[]
  >([]);

  const transcribeText = useMemo(() => {
    const historyText = transcriptHistory
      .map((transcript) => transcript.transcript)
      .join(" ");
    return historyText + (currentTranscript?.transcript ?? "");
  }, [transcriptHistory, currentTranscript]);

  const { averageClarity, averageSpeedWPM } = useMemo(() => {
    // get clarity
    const clarityScores = [
      0.5,
      ...transcriptHistory
        .map((transcript) => transcript.speechClarity)
        .filter((value) => value !== undefined),
    ];

    const totalClarity = clarityScores.reduce((a, b) => a! + b!, 0);
    const clarityScore = totalClarity! / clarityScores.length;
    const clarityScorePercentage = Math.round(clarityScore * 100);

    // get speed
    const AVERAGE_WPM_SPEAKING = 150;
    const speeds = [
      AVERAGE_WPM_SPEAKING,
      ...transcriptHistory
        .map((transcript) => transcript.averageSpeedWPM)
        .filter((value) => value !== undefined),
    ];

    const totalSpeed = speeds.reduce((a, b) => a! + b!, 0);
    const averageSpeedWPM = totalSpeed! / speeds.length;
    const averageSpeedRounded = Math.round(averageSpeedWPM);

    return {
      averageClarity: clarityScorePercentage,
      averageSpeedWPM: averageSpeedRounded,
    };
  }, [transcriptHistory]);

  const [finalTranscript, setFinalTranscript] = useState<string>("");

  const socketRef = useRef<Socket<DefaultEventsMap, DefaultEventsMap> | null>(
    null,
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  async function startRecording() {
    // Reset state
    setCurrentTranscript(null);
    setTranscriptHistory([]);
    setRecordingState(RecodingState.WAITING_FOR_PERMISSION);

    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      if (!mediaStreamRef) {
        return setRecordingState(RecodingState.ERROR);
      }

      mediaRecorderRef.current = new MediaRecorder(mediaStreamRef.current, {
        mimeType: "audio/webm",
      });

      if (socketRef.current) {
        throw new Error("Socket already initialized");
      }

      socketRef.current = io("http://localhost:3001");
      socketRef.current.on("connect", () => {
        console.log("connected");
      });

      socketRef.current.on(
        "transcript",
        (transcriptResponse: TranscriptResponse) => {
          if (transcriptResponse.isFinal) {
            setTranscriptHistory((prevTranscriptHistory) => [
              ...prevTranscriptHistory,
              transcriptResponse,
            ]);
            setCurrentTranscript(null);
          } else {
            setCurrentTranscript(transcriptResponse);
          }
        },
      );

      socketRef.current.on("disconnect", () => {
        console.log("disconnected");
      });

      mediaRecorderRef.current.addEventListener("dataavailable", (event) => {
        if (!socketRef.current) {
          console.error("Media Recoder current but socket not initialized");
        }
        socketRef.current?.emit("audio", event.data);
      });

      mediaRecorderRef.current.start(500);
      setRecordingState(RecodingState.RECORDING);
    } catch (error) {
      console.error(error);
      setRecordingState(RecodingState.PERMISSION_DENIED);
    }
  }

  function onCloseButtonClick() {
    _stopRecordingDevices();
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    onSheetClosed(null);
  }

  function _stopRecordingDevices() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }

  async function completeRecording() {
    _stopRecordingDevices();
    setRecordingState(RecodingState.PROCESSING);

    // keep socket open till we get the final transcript
    // while (currentTranscript != null) {
    //   await new Promise((resolve) => setTimeout(resolve, 100));
    // }

    if (socketRef.current) {
      console.log("disconnecting socket");
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setFinalTranscript(transcribeText);
    setRecordingState(RecodingState.COMPLETED);
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
      <div className="relative h-fit w-1/2 rounded-lg bg-white p-4">
        <button
          className="absolute -right-5 -top-5 h-10 w-10 rounded-full bg-red-500 p-2"
          onClick={onCloseButtonClick}
        >
          X
        </button>
        <div className="flex flex-col items-center">
          <div className="text-xl">Please Record Your Response</div>

          {recordingState === RecodingState.NOT_STARTED && (
            <div className="flex w-full flex-row justify-around">
              <button
                className="rounded-lg bg-green-500 p-2"
                onClick={startRecording}
              >
                Record
              </button>
              <button
                className="rounded-lg bg-blue-500 p-2"
                onClick={() =>
                  setRecordingState(RecodingState.USE_TEXT_ALTERNATIVE)
                }
              >
                Use Text Alternative
              </button>
            </div>
          )}
          {recordingState === RecodingState.WAITING_FOR_PERMISSION && (
            <div>Waiting for permission</div>
          )}
          {recordingState === RecodingState.PERMISSION_DENIED && (
            <div>Permission denied</div>
          )}

          {recordingState === RecodingState.RECORDING && (
            <div className="flex w-full flex-col">
              <div className="flex flex-row ">
                <div className="flex w-1/2 flex-col items-center">
                  <div className="text-lg font-bold">Transcript: </div>
                  <div className="h-96 w-full overflow-x-scroll rounded border border-black">
                    {transcribeText}
                  </div>
                </div>
                <div className="flex w-1/2 flex-col items-center p-2">
                  <div className="text-lg font-bold">Evaluation: </div>
                  <div>Speech Clarity: {averageClarity}</div>
                  <div>Words Per Minute: {averageSpeedWPM}</div>
                </div>
              </div>
              <button
                className="rounded-lg bg-red-500 p-2"
                onClick={completeRecording}
              >
                Stop Recording
              </button>
            </div>
          )}

          {recordingState === RecodingState.PROCESSING && <div>Processing</div>}

          {recordingState === RecodingState.COMPLETED && (
            <div className="flex w-full flex-col items-center">
              <div className="flex w-full flex-row">
                <div className="flex w-1/2 flex-col items-center">
                  <div className="text-lg font-bold">Transcript: </div>
                  <textarea
                    className="h-96 w-full rounded border border-black"
                    value={finalTranscript}
                    onChange={(event) => {
                      setFinalTranscript(event.target.value);
                    }}
                  />
                </div>

                <div className="flex w-1/2 flex-col items-center p-2">
                  <div className="text-lg font-bold">Evaluation: </div>
                  <div>Speech Clarity: {averageClarity}</div>
                  <div>Words Per Minute: {averageSpeedWPM}</div>
                </div>
              </div>
              <div className="flex w-3/4 flex-row justify-around">
                <button
                  className="rounded-lg bg-green-500 p-2"
                  onClick={startRecording}
                >
                  Record Again
                </button>
                <button
                  className="rounded-lg bg-blue-500 p-2"
                  onClick={() => onSheetClosed(finalTranscript)}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {recordingState === RecodingState.USE_TEXT_ALTERNATIVE && (
            <div className="flex w-full flex-col items-center">
              <div className="text-lg font-bold">Transcript: </div>
              <textarea
                className="h-96 w-full rounded border border-black"
                value={finalTranscript}
                onChange={(event) => {
                  setFinalTranscript(event.target.value);
                }}
              />
              <button
                className="rounded-lg bg-blue-500 p-2"
                onClick={() => onSheetClosed(finalTranscript)}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
