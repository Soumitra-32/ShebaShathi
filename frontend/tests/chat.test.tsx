// @vitest-environment jsdom
// Component tests for the ChatModal floating assistant. The backend call goes
// through the shared askCopilotChat() helper, so that helper is mocked and the
// assertions check that the question and the current UI language are forwarded.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";

const askCopilotChat = vi.fn();
vi.mock("../lib/api", () => ({
  askCopilotChat: (...args: unknown[]) => askCopilotChat(...args),
}));

import ChatModal from "../components/ChatModal";
import { LanguageProvider } from "../lib/language";

function makeI18n() {
  const instance = i18next.createInstance({
    lng: "en",
    fallbackLng: "en",
    resources: {
      en: {
        translation: {
          chat: {
            title: "Live Assistant",
            placeholder: "Ask a question...",
            send: "Send",
            thinking: "Thinking",
            error: "Failed to get response. Please try again.",
            close: "Close",
            intro: "Ask about any service",
            grounded: "Grounded",
          },
        },
      },
    },
    interpolation: { escapeValue: false },
  });
  void instance.init();
  return instance;
}

function renderChatModal(onClose: () => void) {
  return render(
    <I18nextProvider i18n={makeI18n()}>
      <LanguageProvider>
        <ChatModal open={true} onClose={onClose} />
      </LanguageProvider>
    </I18nextProvider>
  );
}

describe("ChatModal", () => {
  beforeEach(() => {
    askCopilotChat.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("sends the question and the current UI language through askCopilotChat", async () => {
    askCopilotChat.mockResolvedValue({ answer: "Mocked answer" });
    const onClose = vi.fn();
    renderChatModal(onClose);

    fireEvent.change(screen.getByPlaceholderText(/Ask a question/i), {
      target: { value: "Test question" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send/i }));

    expect(screen.getByText("Test question")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Mocked answer")).toBeInTheDocument());
    // The persisted default is Bangla; the modal must not hard-code "en".
    expect(askCopilotChat).toHaveBeenCalledWith("Test question", [], "bn", undefined);
  });

  it("shows the error message when the copilot request fails", async () => {
    askCopilotChat.mockRejectedValue(new Error("Network error"));
    const onClose = vi.fn();
    renderChatModal(onClose);

    fireEvent.change(screen.getByPlaceholderText(/Ask a question/i), { target: { value: "Fail" } });
    fireEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => expect(screen.getByText(/Failed to get response/i)).toBeInTheDocument());
  });

  it("shows the error message when the copilot returns no usable answer", async () => {
    askCopilotChat.mockResolvedValue({ answer: "   " });
    const onClose = vi.fn();
    renderChatModal(onClose);

    fireEvent.change(screen.getByPlaceholderText(/Ask a question/i), { target: { value: "Empty" } });
    fireEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => expect(screen.getByText(/Failed to get response/i)).toBeInTheDocument());
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderChatModal(onClose);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
