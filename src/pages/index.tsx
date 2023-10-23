import Head from "next/head";
import { useState } from "react";
import useWebSocket from "react-use-websocket";

interface Message {
  message: string;
  name: string;
}

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

  const [messages, setMessages] = useState<Message[]>([
    // { message: "Hello", name: "Interviewer:" },
    // {
    //   message:
    //     "This is a lot of texkflsjklfsjdklfjsaklfjksladjfksadjfksjfklsajfklasjfklsajfkasjklfajsklfajklfjakljfkajfkajsfklasjklfajkfajskfjaksjfkasljfaklsfklas:",
    //   name: "Candidate:",
    // },
  ]);

  const { sendMessage } = useWebSocket("ws://localhost:8001", {
    onOpen: () => {
      console.log("WebSocket connection established.");
    },
    onError: (event: WebSocketEventMap["error"]) => {
      console.error("WebSocket error observed:", event);
    },
    onMessage: (event: WebSocketEventMap["message"]) => {
      console.log("WebSocket message received:", event);
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
      <main className="flex min-h-screen flex-col items-center ">
        <div className="text-3xl">Casey Your Personal Case Trainer</div>

        <ul className="grid w-1/2 grid-cols-3 space-y-5">
          {messages.map((message) => (
            <ChatBubble {...message} />
          ))}
        </ul>

        <div className="grow"/>
  

        <ChatInput
          onSendMessage={postMessage}
          isInputActive={inputActive}
          setIsInputActive={setInputActive}
        />
      </main>
    </>
  );
}
