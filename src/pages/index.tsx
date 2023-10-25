import Head from "next/head";
import { useMemo, useRef, useState } from "react";
import useWebSocket from "react-use-websocket";
import { Socket, io } from "socket.io-client";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { set } from "zod";
import { RecordingModal } from "~/components/recording_modal";

interface Message {
  name: string;
  message: string;
}

interface EnterInputButtonProps {
  onRecordingSubmitted: (transcript: string) => void;
}

const EnterInputButton = ({ onRecordingSubmitted }: EnterInputButtonProps) => {
  const [recodingModalOpen, setRecordingModalOpen] = useState(false);

  function onSheetClosed(transcript: string | null) {
    setRecordingModalOpen(false);
    if (transcript !== null) {
      onRecordingSubmitted(transcript);
    }
  }

  return (
    <div className="relative">
      <button
        className="rounded bg-green-500 m-4 p-4 text-white font-bold"
        onClick={() => setRecordingModalOpen(true)}
      >
        Add Input
      </button>
      {recodingModalOpen && <RecordingModal onSheetClosed={onSheetClosed} />}
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

        {(inputActive) && (
          <EnterInputButton onRecordingSubmitted={postMessage} />
        )}
      </main>
    </>
  );
}
