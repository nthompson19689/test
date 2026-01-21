"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, ImagePlus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Provider, Message } from "@/types";
import { PROVIDER_MODELS } from "@/types";
import { cn } from "@/lib/utils/cn";

interface ChatMessage extends Message {
  id: string;
  provider?: Provider;
  model?: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  apiKeys: Array<{ id: string; provider: string; name: string; keyLastFour: string }>;
}

export function ChatInterface({ apiKeys }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState("gpt-4o");
  const [apiKeyId, setApiKeyId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Update model when provider changes
  useEffect(() => {
    const models = PROVIDER_MODELS[provider]?.filter((m) => !m.supportsImages);
    if (models && models.length > 0) {
      setModel(models[0].id);
    }
  }, [provider]);

  // Update API key when provider changes
  useEffect(() => {
    const keys = apiKeys.filter((k) => k.provider === provider);
    if (keys.length > 0) {
      setApiKeyId(keys[0].id);
    } else {
      setApiKeyId("");
    }
  }, [provider, apiKeys]);

  // Handle image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setImages((prev) => [...prev, base64]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // Remove image
  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Send message
  const sendMessage = useCallback(async () => {
    if (!input.trim() && images.length === 0) return;
    if (!apiKeyId) {
      alert("Please select an API key");
      return;
    }

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: input,
      images: images.length > 0 ? images : undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setImages([]);
    setIsLoading(true);
    setStreamingContent("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
            images: m.images,
          })),
          provider,
          model,
          apiKeyId,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to send message");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setStreamingContent(fullContent);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: fullContent,
        provider,
        model,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent("");
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, images, messages, provider, model, apiKeyId]);

  // Handle key press
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const availableModels = PROVIDER_MODELS[provider]?.filter((m) => !m.supportsImages) || [];
  const filteredKeys = apiKeys.filter((k) => k.provider === provider);
  const currentModel = PROVIDER_MODELS[provider]?.find((m) => m.id === model);
  const supportsVision = currentModel?.supportsVision || false;

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center gap-4">
        <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
          <SelectTrigger className="w-36 bg-slate-800 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
            <SelectItem value="google">Google</SelectItem>
            <SelectItem value="perplexity">Perplexity</SelectItem>
          </SelectContent>
        </Select>

        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="w-48 bg-slate-800 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={apiKeyId} onValueChange={setApiKeyId}>
          <SelectTrigger className="w-48 bg-slate-800 border-slate-700">
            <SelectValue placeholder="Select API Key" />
          </SelectTrigger>
          <SelectContent>
            {filteredKeys.map((key) => (
              <SelectItem key={key.id} value={key.id}>
                {key.name} (****{key.keyLastFour})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filteredKeys.length === 0 && (
          <span className="text-sm text-amber-400">
            No API keys for {provider}
          </span>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              <p className="text-lg">Start a conversation</p>
              <p className="text-sm mt-2">
                Select a provider and model, then type your message below.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* Streaming content */}
          {streamingContent && (
            <MessageBubble
              message={{
                id: "streaming",
                role: "assistant",
                content: streamingContent,
                timestamp: new Date(),
              }}
              isStreaming
            />
          )}

          {/* Loading indicator */}
          {isLoading && !streamingContent && (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-slate-800">
        <div className="max-w-4xl mx-auto">
          {/* Image previews */}
          {images.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {images.map((img, i) => (
                <div key={i} className="relative">
                  <img
                    src={img}
                    alt={`Upload ${i + 1}`}
                    className="h-20 w-20 object-cover rounded-lg border border-slate-700"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {supportsVision && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-800 border-slate-700"
                >
                  <ImagePlus className="w-4 h-4" />
                </Button>
              </>
            )}

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type your message..."
              rows={1}
              className="flex-1 min-h-[44px] max-h-32 bg-slate-800 border-slate-700 resize-none"
            />

            <Button
              onClick={sendMessage}
              disabled={isLoading || (!input.trim() && images.length === 0)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Message bubble component
function MessageBubble({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-blue-600 text-white"
            : "bg-slate-800 text-slate-100"
        )}
      >
        {/* Images */}
        {message.images && message.images.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {message.images.map((img, i) => (
              <img
                key={i}
                src={img}
                alt={`Image ${i + 1}`}
                className="max-h-48 rounded-lg"
              />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="whitespace-pre-wrap">{message.content}</div>

        {/* Metadata */}
        {!isUser && message.provider && (
          <div className="mt-2 pt-2 border-t border-slate-700 text-xs text-slate-400">
            {message.provider} / {message.model}
          </div>
        )}

        {/* Streaming indicator */}
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-1" />
        )}
      </div>
    </div>
  );
}
