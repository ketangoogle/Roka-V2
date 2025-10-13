import {
  useVoiceAssistant, RoomAudioRenderer, VoiceAssistantControlBar,
  useTrackTranscription, useLocalParticipant, useChat,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useEffect, useState, useRef } from "react";
import { FileText, PaperPlaneRight, Paperclip, Plus } from "@phosphor-icons/react";
import Notification from "./Notification";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

export function VoiceAssistant({ sessionId, userId }) {
  // --- STATE & HOOKS ---
  const { state, agentTranscriptions } = useVoiceAssistant();
  const { send, chatMessages } = useChat();
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const localParticipant = useLocalParticipant();

  // --- THE CRITICAL FIX: Your original hook, now protected by a guard clause below ---
  // This hook will only be initialized when `localParticipant.microphoneTrack` is guaranteed to exist.
  const { segments: userTranscriptions } = useTrackTranscription({
    publication: localParticipant.microphoneTrack,
    source: Track.Source.Microphone,
    participant: localParticipant.localParticipant,
  });

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [stagedImages, setStagedImages] = useState([]);
  const [submittedImages, setSubmittedImages] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [notification, setNotification] = useState('');
  
  const chatListRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- DATA FETCHING & SYNCHRONIZATION ---

  const fetchHistory = async () => {
    if (!sessionId) return;
    try {
      setIsLoadingHistory(true);
      const response = await fetch(`${BACKEND_URL}/session/${sessionId}`);
      if (!response.ok) throw new Error("Failed to fetch session history.");
      const history = await response.json();
      
      const formattedHistory = history.map((msg, index) => ({
        id: `hist-${index}-${msg.timestamp}`, type: msg.role === 'user' ? 'user' : 'agent',
        text: msg.text_content, file_url: msg.file_url,
        firstReceivedTime: new Date(msg.timestamp).getTime(),
      }));
      setMessages(formattedHistory);

      const historyImages = history
        .filter(msg => msg.file_url && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(msg.file_url))
        .map((msg, index) => ({
          id: `db-img-${index}-${msg.timestamp}`,
          url: msg.file_url,
          name: msg.text_content.replace('📎 ', '')
        }));
      setSubmittedImages(historyImages);

    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [sessionId]);

  // Restored your original, simple, and correct message merging logic
  useEffect(() => {
    const newItems = [
      ...(agentTranscriptions?.map((t) => ({ ...t, type: "agent" })) ?? []),
      ...(userTranscriptions?.map((t) => ({ ...t, type: "user" })) ?? []),
      ...(chatMessages.map((msg) => ({
        id: msg.id, text: msg.message, type: msg.from?.isLocal ? "user" : "agent", firstReceivedTime: msg.timestamp,
      })) ?? []),
    ];

    if (newItems.length > 0) {
      setMessages((prevMessages) => {
        const messageMap = new Map(prevMessages.map(msg => [msg.id, msg]));
        newItems.forEach((item) => messageMap.set(item.id, item));
        return Array.from(messageMap.values()).sort((a, b) => a.firstReceivedTime - b.firstReceivedTime);
      });
    }
  }, [agentTranscriptions, userTranscriptions, chatMessages]);

  useEffect(() => {
    if (chatListRef.current) chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [messages]);


  // --- EVENT HANDLERS ---
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      await send(inputValue.trim());
      setInputValue("");
    }
  };
  
  const handleUploadClick = () => fileInputRef.current?.click();
  
  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if ((stagedImages.length + submittedImages.length) >= 2) {
      setNotification("You can only attach a maximum of two images.");
      if (event.target) event.target.value = null;
      return;
    }
    setIsPanelOpen(true);
    try {
      const urlResponse = await fetch(`${BACKEND_URL}/generate-upload-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: file.name, content_type: file.type, session_id: sessionId }),
      });
      const urlData = await urlResponse.json();
      if (!urlResponse.ok) throw new Error(urlData.message || 'Failed to get upload URL.');
      
      await fetch(urlData.upload_url, {
        method: 'PUT', headers: { 'Content-Type': file.type }, body: file,
      });
      
      const newImage = {
        id: `staged-${file.name}-${Date.now()}`,
        previewUrl: URL.createObjectURL(file),
        blobName: urlData.blob_name,
        originalFilename: file.name,
      };
      setStagedImages(prev => [...prev, newImage]);
      
    } catch (error) {
      console.error('File staging failed:', error);
      setNotification(`Error preparing file: ${error.message}`);
    } finally {
      if (event.target) event.target.value = null;
    }
  };

  const handleSubmitImages = async () => {
    if (stagedImages.length === 0) return;
    setIsSubmitting(true);
    try {
      await Promise.all(stagedImages.map(image => 
        fetch(`${BACKEND_URL}/confirm-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blob_name: image.blobName,
            session_id: sessionId,
            original_filename: image.originalFilename,
          }),
        }).then(res => {
          if (!res.ok) throw new Error('One or more images failed to submit.');
        })
      ));

      setNotification('Images submitted successfully!');
      setStagedImages([]);
      await fetchHistory();

    } catch (error) {
      console.error('Failed to submit images:', error);
      setNotification(`Error submitting images: ${error.message}`);
      await fetchHistory();
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAgentStatusText = () => {
    switch (state) {
      case "listening": return "Listening...";
      case "thinking": return "Thinking...";
      case "speaking": return "Speaking...";
      default: return "Idle";
    }
  };

  // --- THE CRITICAL GUARD CLAUSE ---
  // This prevents the component from rendering (and crashing) until the microphone is ready.
  if (!localParticipant || !localParticipant.microphoneTrack) {
    return (
      <div className="chat-container">
        <div className="loading-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Connecting to voice agent...
        </div>
      </div>
    );
  }

  // --- JSX RENDER ---
  const allImagesInPanel = [...submittedImages, ...stagedImages];

  return (
    <div className="chat-container">
      <Notification message={notification} onClose={() => setNotification('')} />
      <header className="app-navbar">
        <div className="navbar-welcome">Welcome, <strong>{userId}</strong>. Capturing your new idea...</div>
        <div className="navbar-brand">
          <span>ROKA Agent | Idea Submitter</span>
          <img src="/taj-logo.png" alt="TAJ Logo" />
        </div>
      </header>

      <div className={`voice-assistant-layout ${isPanelOpen ? 'panel-open' : ''}`}>
        <main className="chat-list" ref={chatListRef}>
          {isLoadingHistory ? (<div className="loading-state">Loading chat history...</div>) : (
            messages.map((msg) => {
              const isImageMessage = msg.file_url && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(msg.file_url);
              if (isImageMessage) return null;

              return (
                <div key={msg.id} className={`message-row ${msg.type}-row`}>
                  <img src={msg.type === 'agent' ? '/agent-logo.png' : '/user-logo.png'} alt={`${msg.type} avatar`} className="chat-avatar" />
                  {msg.file_url ? (
                    <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={`chat-bubble ${msg.type}-bubble file-bubble`}>
                      <FileText size={24} /> <span>{msg.text.replace('📎 ', '')}</span>
                    </a>
                  ) : (
                    <div className={`chat-bubble ${msg.type}-bubble`}>{msg.text}</div>
                  )}
                </div>
              );
            })
          )}
        </main>

        <aside className="attachment-panel">
          <h4>Attachments ({allImagesInPanel.length}/2)</h4>
          <div className="image-placeholder-container">
            {[...Array(2)].map((_, index) => {
              const image = allImagesInPanel[index];
              return (
                <div
                  key={image ? image.id : `placeholder-${index}`}
                  className={`image-placeholder ${!image && allImagesInPanel.length < 2 ? 'clickable' : ''}`}
                  onClick={() => {
                    if (!image && allImagesInPanel.length < 2) handleUploadClick();
                  }}
                >
                  {image ? (
                    <img src={image.url || image.previewUrl} alt={image.name || image.originalFilename} className="attachment-thumbnail" />
                  ) : (
                    <div className="add-image-prompt">
                      <Plus size={32} />
                      <span>Add Image</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {stagedImages.length > 0 && (
            <button
              className="action-button submit-images-button"
              disabled={isSubmitting}
              onClick={handleSubmitImages}
            >
              {isSubmitting ? 'Submitting...' : `Submit ${stagedImages.length} Image(s)`}
            </button>
          )}
        </aside>
      </div>
      
      <footer className="chat-footer">
        <div className="footer-top-row">
          <form onSubmit={handleSendMessage} className="chat-input-form">
            <input type="text" className="chat-input" placeholder="Type a message..." value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
            <button type="submit" className="icon-button send-button" aria-label="Send message" disabled={!inputValue.trim()}>
              <PaperPlaneRight size={22} weight="fill" />
            </button>
          </form>
          <button onClick={() => setIsPanelOpen(!isPanelOpen)} className="icon-button" aria-label="Toggle attachments panel" title="Attach Files">
            <Paperclip size={24} />
          </button>
        </div>
        <div className="footer-bottom-row">
          <div className="agent-status"><div className={`status-light ${state}`}></div><span>{getAgentStatusText()}</span></div>
          <VoiceAssistantControlBar />
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*" />
      </footer>
      <RoomAudioRenderer />
    </div>
  );
}