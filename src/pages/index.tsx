import Head from "next/head";
import { useMemo, useRef, useState } from "react";
import useWebSocket from "react-use-websocket";
import { Socket, io } from "socket.io-client";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { set } from "zod";

interface Message {
  message: string;
  name: string;
}

enum RecodingState {
  NOT_STARTED,
  WAITING_FOR_PERMISSION,
  PERMISSION_DENIED,
  RECORDING,
  PROCESSING,
  COMPLETED,
  ERROR,
}

interface RecordingSheetProps {
  onSheetClosed: () => void;
}

interface TranscriptResponse {
  transcript: string;
  isFinal: boolean;
  speechClarity: number;
}

const RecordingSheet = ({ onSheetClosed }: RecordingSheetProps) => {
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
      .join(". ");
    return historyText + (currentTranscript?.transcript ?? "");
  }, [transcriptHistory, currentTranscript]);

  const averageClarity = useMemo(() => {
    const clarityScores = [0.5, ...transcriptHistory.map(
      (transcript) => transcript.speechClarity,
    )];
    const totalClarity = clarityScores.reduce((a, b) => a + b, 0);
    return totalClarity / clarityScores.length;
  }, [transcriptHistory]);

  let socket: Socket<DefaultEventsMap, DefaultEventsMap> | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;

  async function startRecording() {
    // Reset state
    setCurrentTranscript(null);
    setTranscriptHistory([]);
    setRecordingState(RecodingState.WAITING_FOR_PERMISSION);

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      if (!mediaStream) {
        return setRecordingState(RecodingState.ERROR);
      }

      mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: "audio/webm",
      });

      socket = io("http://localhost:3001");
      socket.on("connect", () => {
        console.log("connected");
      });

      socket.on("transcript", (transcriptResponse: TranscriptResponse) => {
        console.log("Received result of clarity score: " + transcriptResponse.speechClarity);
        if (transcriptResponse.isFinal) {
          setTranscriptHistory((prevTranscriptHistory) => [
            ...prevTranscriptHistory,
            transcriptResponse,
          ]);
          setCurrentTranscript(null);
        } else {
          setCurrentTranscript(transcriptResponse);
        }
      });

      socket.on("disconnect", () => {
        console.log("disconnected");
      });

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (!socket) {
          throw new Error("Socket not initialized");
        }
        socket.emit("audio", event.data);
      });
      mediaRecorder.start(1000);
      setRecordingState(RecodingState.RECORDING);
    } catch (error) {
      console.error(error);
      setRecordingState(RecodingState.PERMISSION_DENIED);
    }
  }

  async function stopRecording() {
    mediaRecorder?.stop();
    mediaStream?.getTracks().forEach((track) => track.stop());

    mediaRecorder = null;
    mediaStream = null;

    setRecordingState(RecodingState.PROCESSING);
    // keep socket open till we get the final transcript
    while (currentTranscript != null) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    socket?.disconnect();
    setRecordingState(RecodingState.COMPLETED);
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
      <div className="relative rounded-lg bg-white p-4">
        <button
          className="absolute -right-5 -top-5 h-10 w-10 rounded-full bg-red-500 p-2"
          onClick={onSheetClosed}
        >
          X
        </button>
        <div className="text-xl">Please Record Your Response</div>

        {recordingState === RecodingState.NOT_STARTED && (
          <button
            className="rounded-lg bg-green-500 p-2"
            onClick={startRecording}
          >
            Record
          </button>
        )}
        {recordingState === RecodingState.WAITING_FOR_PERMISSION && (
          <div>Waiting for permission</div>
        )}
        {recordingState === RecodingState.PERMISSION_DENIED && (
          <div>Permission denied</div>
        )}

        {recordingState === RecodingState.RECORDING && (
          <div>
            <div className="flex flex-row">
              <div className="w-1/2">
                <textarea
                  className="h-40 w-full p-2"
                  value={transcribeText}
                  readOnly
                />
              </div>
              <div className="flex flex-col h-40 w-1/2 p-2">
                <div>Speech Clarity: {averageClarity}</div>
                <div className="grow bg-red-500"/>
              </div>
            </div>
            <button
              className="rounded-lg bg-red-500 p-2"
              onClick={stopRecording}
            >
              Stop Recording
            </button>
          </div>
        )}

        {recordingState === RecodingState.PROCESSING && <div>Processing</div>}

        {recordingState === RecodingState.COMPLETED && (
          <div>
            <div className="flex flex-row">
              <div className="w-1/2">
                <textarea
                  className="h-40 w-full p-2"
                  value={transcribeText}
                  readOnly
                />
              </div>
              <div className="h-40 w-1/2 bg-gray-200 p-2">Placeholder</div>
            </div>
            <div className="flex flex-row">
              <button
                className="rounded-lg bg-green-500 p-2"
                onClick={startRecording}
              >
                Record Again
              </button>
              <button
                className="rounded-lg bg-blue-500 p-2"
                onClick={onSheetClosed}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Recorder = () => {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="rounded-full bg-red-500 p-2"
        onClick={() => setSheetOpen(true)}
      ></button>
      {sheetOpen && (
        <RecordingSheet onSheetClosed={() => setSheetOpen(false)} />
      )}
    </div>
  );
};

const ChatBubble = (message: Message) => {
  function isMessageFromUser() {
    return message.name === "Candidate:";
  }
  return (
    <div
      className={`${
        isMessageFromUser()
          ? "col-start-2 place-self-end"
          : "col-start-1 place-self-start"
      } col-span-2 max-w-full space-y-2`}
    >
      <div
        className={`rounded-2xl p-5 ${
          isMessageFromUser()
            ? "rounded-tr-none bg-green-300"
            : "rounded-tl-none bg-red-300"
        }`}
      >
        <div className="text-sm">{message.name}</div>
        <div className="break-words text-base">{message.message}</div>
      </div>
    </div>
  );
};

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isInputActive: boolean;
  setIsInputActive: (active: boolean) => void;
}

const ChatInput = ({
  isInputActive,
  setIsInputActive,
  onSendMessage,
}: ChatInputProps) => {
  const [inputValue, setInputValue] = useState("");

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleSendClick = () => {
    if (!isInputActive) {
      throw new Error("Input is not active");
    }

    if (inputValue.trim() !== "") {
      onSendMessage(inputValue);
      setInputValue("");
      setIsInputActive(false);
    }
  };

  return (
    <div className="mt-4 flex flex-row p-4">
      <input
        className="w-3/4 rounded-l-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
        placeholder="Type your message here..."
        value={inputValue}
        onChange={handleInputChange}
      />
      <button
        className={`w-1/4 rounded-r-lg bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 ${
          isInputActive ? "" : "cursor-not-allowed opacity-50"
        }`}
        onClick={handleSendClick}
        disabled={!isInputActive}
      >
        Send
      </button>
    </div>
  );
};

export default function Home() {
  const [inputActive, setInputActive] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const afterLastChatMessageRef = useRef<HTMLDivElement>(null);
  const { sendMessage } = useWebSocket("ws://localhost:8001", {
    onOpen: () => {
      console.log("WebSocket connection established.");
    },
    onError: (event: WebSocketEventMap["error"]) => {
      console.error("WebSocket error observed:", event);
    },
    onMessage: (event: WebSocketEventMap["message"]) => {
      const message: string = event.data;

      // Case 1 input request
      if (message === "input_request") {
        setInputActive(true);
        return;
      }

      // Default Case Normal Message
      const messageAuthor = message.split(" ")[0];
      if (!messageAuthor) {
        throw new Error("Message author not found");
      }
      const message_text = message.split(" ").slice(1).join(" ");
      const allowedTags = ["Interviewer:", "Candidate:"];
      if (!allowedTags.includes(messageAuthor)) {
        return;
      }

      setMessages([
        ...messages,
        { message: message_text, name: messageAuthor },
      ]);

      if (afterLastChatMessageRef) {
        // sleep shortly then scroll into view
        setTimeout(() => {
          afterLastChatMessageRef.current?.scrollIntoView({
            behavior: "smooth",
          });
        }, 100);
      }
    },
  });

  const postMessage = (messageString: string) => {
    sendMessage(messageString);
  };

  return (
    <>
      <Head>
        <title>Casey Case Training</title>
      </Head>
      <main className="flex max-h-screen min-h-screen flex-col items-center ">
        <div className="text-3xl">Casey Your Personal Case Trainer</div>

        <ul className="grid w-1/2 grid-cols-3 space-y-5 overflow-scroll">
          {messages.map((message) => (
            <ChatBubble {...message} />
          ))}

          <div ref={afterLastChatMessageRef} />
        </ul>
        <div className="grow" />

        <ChatInput
          onSendMessage={postMessage}
          isInputActive={inputActive}
          setIsInputActive={setInputActive}
        />
        <Recorder />
      </main>
    </>
  );
}
