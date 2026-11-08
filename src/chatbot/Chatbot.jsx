import { useState, useRef, useEffect, useEffectEvent, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './Chatbot.css';
import { apiFetch } from '../shared/api.js';
import { readChatStream } from './chatStream.js';
import { ArrowLeft, Plus, MoreHorizontal, UserRound, ArrowUp, ChevronRight } from 'lucide-react';
import ThinkingIndicator from './ThinkingIndicator.jsx';
import RenameChatDialog from './RenameChatDialog.jsx';
import QuizDialog from './QuizDialog.jsx';
import { validateQuizStructure } from '../../shared/quiz.js';
import useSavedChats, { newChat } from './useSavedChats.js';

function Chatbot({ currentUser = null, onBack, openVersion = 0, isActive = true }) {
  const [input, setInput] = useState('');

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [chatMenu, setChatMenu] = useState(null); 
  const [renameTarget, setRenameTarget] = useState(null);
  const chatOptionsTriggerRef = useRef(null);
  const mobileBreakpointRef = useRef(window.innerWidth <= 768);
  const [showInputMenu, setShowInputMenu] = useState(false);
  const quizTriggerRef = useRef(null);
  const [isTyping, setIsTyping] = useState(false);
  const { chats, setChats, activeChatId, setActiveChatId, historyReady, historyError, retryHistory, deleteSaved } = useSavedChats(isTyping);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizTopic, setQuizTopic] = useState('');
  const [quizItems, setQuizItems] = useState('5');
  const [quizParts, setQuizParts] = useState('1');
  const [partTypes, setPartTypes] = useState({ 0: 'multiple choice', 1: 'multiple choice', 2: 'multiple choice' });
  const [enableTimer, setEnableTimer] = useState(false);
  const [timePerPart, setTimePerPart] = useState({ 0: 5, 1: 5, 2: 5 }); 
  const [timeLeft, setTimeLeft] = useState(0); 
  const [activeQuizData, setActiveQuizData] = useState(null);
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [enumInput, setEnumInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const sendingRef = useRef(false);
  const requestControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const messageImageUrls = useRef(new Set());
  const [landingSession, setLandingSession] = useState(() => openVersion > 0);
  useEffect(() => () => {
    for (const url of messageImageUrls.current) URL.revokeObjectURL(url);
    messageImageUrls.current.clear();
  }, []);
  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];
  const messages = useMemo(() => landingSession ? [] : activeChat.messages, [activeChat.messages, landingSession]);
  const renderedMessages = useMemo(() => messages.slice(-100), [messages]);
  const responseStartRef = useRef(null);
  const [quizFile, setQuizFile] = useState(null);
  const [fileInstructions, setFileInstructions] = useState('');
  const [chatFile, setChatFile] = useState(null);
  const [chatFilePreview, setChatFilePreview] = useState(null);
  const beginRequest = useCallback(() => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    return controller;
  }, []);
  const finishRequest = useCallback((controller) => {
    if (requestControllerRef.current === controller) requestControllerRef.current = null;
  }, []);
  useEffect(() => () => {
    mountedRef.current = false;
    const request = requestControllerRef.current;
    requestControllerRef.current = null;
    request?.abort();
  }, []);
  useEffect(() => {
    if (!isActive) requestControllerRef.current?.abort();
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const handleResize = () => {
      const nextMobile = window.innerWidth <= 768;
      setIsMobile(nextMobile);
      setWindowHeight(window.innerHeight);
      if (mobileBreakpointRef.current !== nextMobile) {
        mobileBreakpointRef.current = nextMobile;
        setIsSidebarOpen(!nextMobile);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    if (isActive) scrollToBottom();
  }, [messages, isTyping, isActive]);

  useEffect(() => {
    if (!isActive) return;
    const handleClickOutside = (event) => {
      if (chatMenu && !event.target.closest('.floating-chat-menu')) {
        setChatMenu(null);
      }
      if (showInputMenu && !event.target.closest('.input-floating-menu') && !event.target.closest('.plus-button')) {
        setShowInputMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [chatMenu, showInputMenu, isActive]);



  useEffect(() => {
    if (chatFile && chatFile.type && chatFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(chatFile);
      // The object URL must be created after the file changes and revoked on cleanup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChatFilePreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setChatFilePreview(null);
    }
  }, [chatFile]);

  const createNewChat = useCallback(() => {
    if (!historyReady || isTyping) return false;
    const newChatObj = newChat();
    setChats(prev => [newChatObj, ...prev]);
    setActiveChatId(newChatObj.id);
    setLandingSession(false);
    return true;
  }, [historyReady, isTyping, setActiveChatId, setChats]);

  const deleteChat = async (id) => {
    if (isTyping) return;
    try { await deleteSaved(id); } catch { return; }
    const updatedChats = chats.filter(c => c.id !== id);
    if (!updatedChats.length) updatedChats.push(newChat());
    for (const message of chats.find(chat => chat.id === id)?.messages || []) {
      if (message.image) { URL.revokeObjectURL(message.image); messageImageUrls.current.delete(message.image); }
    }
    setChats(updatedChats);
    if (activeChatId === id) setActiveChatId(updatedChats[0].id);
    setChatMenu(null);
  };

  const renameChat = (id, currentTitle) => {
    setRenameTarget({ id, title: currentTitle });
    setChatMenu(null);
  };

  const closeRenameDialog = () => {
    setRenameTarget(null);
    requestAnimationFrame(() => chatOptionsTriggerRef.current?.focus());
  };

  const updateActiveChatMessages = (newMessages, customTitle = null, targetChatId = activeChatId) => {
    setChats(prevChats => prevChats.map(chat => {
      if (chat.id === targetChatId) {
        let title = chat.title;
        if (customTitle) {
          title = customTitle;
        } else if (chat.title === 'New Conversation' && newMessages.length > 0) {
          title = newMessages[0].text.slice(0, 20) + (newMessages[0].text.length > 20 ? '...' : '');
        }
        const normalized = newMessages.map((message, index) => ({ ...message,
          id: message.id || chat.messages[index]?.id || crypto.randomUUID(),
          createdAt: message.createdAt || chat.messages[index]?.createdAt || new Date(Date.now() + index).toISOString() }));
        return { ...chat, messages: normalized, title };
      }
      return chat;
    }));
  };

  const handleTyping = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  const sendMessage = async () => {
    if (!historyReady || (!input.trim() && !chatFile) || isTyping || sendingRef.current) return;
    sendingRef.current = true;
    let conversationId = activeChatId;
    let conversationMessages = messages;
    if (landingSession) {
      const newChatObj = newChat();
      setChats(prev => [newChatObj, ...prev]);
      setActiveChatId(newChatObj.id);
      setLandingSession(false);
      conversationId = newChatObj.id;
      conversationMessages = [];
    }
    
    const userMsgText = input;
    const currentFile = chatFile;
    const isImageFile = currentFile && currentFile.type && currentFile.type.startsWith('image/');

    const attachedImageUrl = isImageFile ? URL.createObjectURL(currentFile) : null;
    if (attachedImageUrl) messageImageUrls.current.add(attachedImageUrl);

    const displayMsg = currentFile && !isImageFile
      ? `*📄 Attached File: ${currentFile.name}*\n\n${userMsgText}`
      : userMsgText;
      
    const newMessages = [...conversationMessages, {
      role: 'user', 
      text: displayMsg, 
      image: attachedImageUrl, 
      fileName: currentFile ? currentFile.name : null 
    }];
    updateActiveChatMessages(newMessages, null, conversationId);

    setInput('');
    setChatFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setIsTyping(true);
    responseStartRef.current = Date.now();
    const requestController = beginRequest();

    const slidingWindowHistory = newMessages.slice(-6);
    const requestMessage = userMsgText;
    updateActiveChatMessages([...newMessages, { role: 'bot', text: '' }], null, conversationId);

    let botReply = '';
    let pending = '';
    let flushTimer = null;

    const flush = () => {
      if (pending) {
        botReply += pending;
        pending = '';
        updateActiveChatMessages([...newMessages, { role: 'bot', text: botReply }], null, conversationId);
      }
    };

    try {
      let response;
      
      if (currentFile) {
        const formData = new FormData();
        formData.append('file', currentFile);
        formData.append('message', requestMessage);
        formData.append('history', JSON.stringify(slidingWindowHistory));
        
        response = await apiFetch('/api/chat', {
          method: 'POST',
          body: formData,
          signal: requestController.signal,
        });
      } else {
        response = await apiFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: requestMessage, history: slidingWindowHistory }),
          signal: requestController.signal,
        });
      }

      await readChatStream(response, (text) => {
        pending += text;
        if (!flushTimer) {
          flushTimer = setTimeout(() => { flush(); flushTimer = null; }, 50);
        }
      });

      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      flush();
      const finalDuration = responseStartRef.current ? (Date.now() - responseStartRef.current) / 1000 : null;
      updateActiveChatMessages([...newMessages, { role: 'bot', text: botReply, duration: finalDuration }], null, conversationId);
    } catch (error) {
      if (requestController.signal.aborted) return;
      console.error(error);
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      const finalDuration = responseStartRef.current ? (Date.now() - responseStartRef.current) / 1000 : null;
      updateActiveChatMessages([...newMessages, { role: 'bot', text: [botReply + pending, error.message || 'Unable to connect to PEDRO. Please try again.'].filter(Boolean).join('\n\n'), duration: finalDuration }], null, conversationId);
    } finally {
      finishRequest(requestController);
      if (mountedRef.current) setIsTyping(false);
      sendingRef.current = false;
    }
  };

  const startQuizGeneration = async () => {
    if (!historyReady || sendingRef.current || isTyping) return;
    sendingRef.current = true;
    let conversationId = activeChatId;
    let conversationMessages = messages;
    if (landingSession) {
      const newChatObj = newChat();
      setChats(prev => [newChatObj, ...prev]);
      setActiveChatId(newChatObj.id);
      setLandingSession(false);
      conversationId = newChatObj.id;
      conversationMessages = [];
    }
    responseStartRef.current = Date.now();
    const requestController = beginRequest();
    setShowQuizModal(false);
    setIsTyping(true);
    
    const quizUserMsg = { 
      role: 'user', 
      text: quizFile 
        ? `Create a mock quiz based on the uploaded file "${quizFile.name}". Instructions: ${fileInstructions || 'General coverage'} (${quizItems} items, ${quizParts} parts)`
        : `Create a mock quiz about: ${quizTopic || 'General Knowledge'} (${quizItems} items, ${quizParts} parts)` 
    };
    const updatedMsgs = [...conversationMessages, quizUserMsg];
    updateActiveChatMessages([...updatedMsgs, { role: 'bot', text: '', pendingKind: 'quiz' }], `Quiz: ${quizFile ? quizFile.name : (quizTopic || 'General Knowledge')}`, conversationId);

    try {
      let response;

      if (quizFile) {
        const formData = new FormData();
        formData.append('document', quizFile);
        formData.append('instructions', fileInstructions);
        formData.append('items', quizItems);
        formData.append('parts', quizParts);
        formData.append('partTypes', JSON.stringify(partTypes));

        response = await apiFetch('/api/quiz/generate-from-file', {
          method: 'POST',
          body: formData,
          signal: requestController.signal,
        });
      } else {
        response = await apiFetch('/api/quiz/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            topic: quizTopic, items: parseInt(quizItems), parts: parseInt(quizParts), partTypes: partTypes 
          }),
          signal: requestController.signal,
        });
      }

      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || `Quiz generation failed (${response.status}).`);
      }
      const data = validateQuizStructure(await response.json());
      
      setActiveQuizData(data);
      setCurrentPartIndex(0);
      setCurrentQIndex(0);
      setUserAnswers({});
      setSelectedAnswer('');
      setEnumInput('');
      
      if (enableTimer) setTimeLeft((timePerPart[0] || 5) * 60);

      updateActiveChatMessages([...updatedMsgs, { role: 'bot', text: `✨ Quiz generated successfully! Launching **${data.title}** now...` }], null, conversationId);
    } catch (error) {
      if (requestController.signal.aborted) return;
      console.error('Quiz loading error:', error);
      setActiveQuizData(null);
      updateActiveChatMessages([...updatedMsgs, { role: 'bot', text: error.message || 'Unable to generate a quiz. Please try again.' }], null, conversationId);
    } finally {
      finishRequest(requestController);
      if (mountedRef.current) setIsTyping(false);
      sendingRef.current = false;
      setQuizFile(null);
      setFileInstructions('');
    }
  };

  const handleNextQuestion = (forceSkipPart = false) => {
    const currentPart = activeQuizData.parts[currentPartIndex];
    const questionKey = `${currentPartIndex}-${currentQIndex}`;
    const currentQ = currentPart.questions[currentQIndex];
    
    const isTrueFalse = currentPart.partTitle.toLowerCase().includes('true');
    const hasOptionsArray = Array.isArray(currentQ.options) && currentQ.options.length > 0;

    const currentAns = hasOptionsArray || isTrueFalse ? selectedAnswer : enumInput;

    const updatedAnswers = { ...userAnswers, [questionKey]: currentAns };
    if (!forceSkipPart) setUserAnswers(updatedAnswers);
    
    setSelectedAnswer('');
    setEnumInput('');

    if (!forceSkipPart && currentQIndex < currentPart.questions.length - 1) {
      setCurrentQIndex(currentQIndex + 1);
    } else if (currentPartIndex < activeQuizData.parts.length - 1) {
      const nextPart = currentPartIndex + 1;
      setCurrentPartIndex(nextPart);
      setCurrentQIndex(0);
      if (enableTimer) setTimeLeft((timePerPart[nextPart] || 5) * 60);
    } else {
      finishQuiz(forceSkipPart ? userAnswers : updatedAnswers);
    }
  };

  const finishQuiz = async (finalAnswers) => {
    let score = 0;
    let totalQuestions = 0;
    let mistakesData = []; 

    activeQuizData.parts.forEach((part, pIdx) => {
      part.questions.forEach((q, qIdx) => {
        totalQuestions++;
        const rawUserAns = finalAnswers[`${pIdx}-${qIdx}`] || '';
        const userAns = rawUserAns.trim().toLowerCase();
        const correctAns = (q.answer || '').trim().toLowerCase();
        
        if (userAns === correctAns) {
          score++;
        } else {
          mistakesData.push(`- **Part ${pIdx + 1}, Q${qIdx + 1}**: "${q.question}"\n  - My Answer: ${rawUserAns || 'None'}\n  - Auto-Grader Expected: ${q.answer}`);
        }
      });
    });

    setActiveQuizData(null);

    const cleanUserMessage = `I finished my quiz! The auto-grader scored me ${score} out of ${totalQuestions}. Can you review my results?`;
    const updatedMessages = [...messages, { role: 'user', text: cleanUserMessage }];
    updateActiveChatMessages(updatedMessages);

    const promptForPedro = `I just completed a mock quiz. The basic auto-grader gave me ${score} out of ${totalQuestions}.\n\n` +
      (mistakesData.length > 0
        ? `The auto-grader uses strict text matching and might have marked me wrong for minor differences. Here are the questions it marked wrong:\n${mistakesData.join('\n')}\n\nPlease review these as a human teacher would. If my answer is conceptually correct (e.g., I listed valid items in a different order, or made a tiny typo), please tell me I actually got it right and explain why! If I am truly wrong, provide a friendly explanation of the correct answer.`
        : `I got a perfect score! Please congratulate me and give a brief encouraging message.`);

    setIsTyping(true);
    responseStartRef.current = Date.now();
    const requestController = beginRequest();

    updateActiveChatMessages([...updatedMessages, { role: 'bot', text: '' }]);

    let botReply = '';
    let pending = '';
    let flushTimer = null;

    const flush = () => {
      if (pending) {
        botReply += pending;
        pending = '';
        updateActiveChatMessages([...updatedMessages, { role: 'bot', text: botReply }]);
      }
    };

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: promptForPedro, history: updatedMessages.slice(-6) }),
        signal: requestController.signal,
      });
      await readChatStream(response, (text) => {
        pending += text;
        if (!flushTimer) {
          flushTimer = setTimeout(() => { flush(); flushTimer = null; }, 50);
        }
      });

      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      flush();
      const finalDuration = responseStartRef.current ? (Date.now() - responseStartRef.current) / 1000 : null;
      updateActiveChatMessages([...updatedMessages, { role: 'bot', text: botReply, duration: finalDuration }]);
    } catch (error) {
      if (requestController.signal.aborted) return;
      console.error(error);
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      const finalDuration = responseStartRef.current ? (Date.now() - responseStartRef.current) / 1000 : null;
      updateActiveChatMessages([...updatedMessages, { role: 'bot', text: [botReply + pending, error.message || 'Unable to review quiz results. Please try again.'].filter(Boolean).join('\n\n'), duration: finalDuration }]);
    } finally {
      finishRequest(requestController);
      if (mountedRef.current) setIsTyping(false);
    }
  };

  const advanceExpiredPart = useEffectEvent(() => handleNextQuestion(true));
  useEffect(() => {
    if (!isActive || !activeQuizData || !enableTimer) return;
    const timerId = setTimeout(() => {
      if (timeLeft > 0) setTimeLeft(prev => prev - 1);
      else advanceExpiredPart();
    }, timeLeft > 0 ? 1000 : 0);
    return () => clearTimeout(timerId);
  }, [activeQuizData, enableTimer, timeLeft, isActive]);

  const cancelQuiz = () => {
    setActiveQuizData(null);
    updateActiveChatMessages([...messages, { role: 'bot', text: "Quiz was cancelled." }]);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="pedro-chatbot" aria-label="PEDRO study assistant" style={{ 
      position: 'fixed', top: 0, left: 0, width: '100%', 
      height: isMobile ? `${windowHeight}px` : '100vh', 
      display: 'flex', flexDirection: 'row', fontFamily: 'system-ui, -apple-system, sans-serif', 
      backgroundColor: '#161222', color: '#ffffff', overflow: 'hidden' 
    }}>
      
      {isMobile && isSidebarOpen && <button className="pedro-sidebar-backdrop" aria-label="Close conversations" onClick={() => setIsSidebarOpen(false)} />}
      {/* ================= SIDEBAR ================= */}
      <aside id="pedro-conversations" className="pedro-sidebar" aria-label="Study conversations" inert={!isSidebarOpen} style={{ 
        width: '280px', flexShrink: 0, backgroundColor: '#2d243f', display: 'flex', flexDirection: 'column', 
        padding: '20px 15px', position: isMobile ? 'absolute' : 'relative', height: '100%',
        left: isMobile ? (isSidebarOpen ? '0' : '-280px') : 'auto',
        marginLeft: !isMobile ? (isSidebarOpen ? '0' : '-280px') : '0',
        zIndex: 50, boxSizing: 'border-box'
      }}>
        
        {/* Logo badge */}
        <div style={{ 
          position: 'absolute', left: 0, top: '25px', backgroundColor: '#ffffff', color: '#000000', 
          padding: '10px 24px 10px 18px', borderRadius: '0 28px 28px 0', fontWeight: '900', 
          fontSize: '22px', letterSpacing: '1.5px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 30
        }}>
          P.E.D.R.O
        </div>

        {/* New chat button */}
        <div style={{ position: 'absolute', right: '15px', top: '20px', zIndex: 30, transition: 'right 0.3s ease' }}>
          <button 
            onClick={createNewChat}
            disabled={!historyReady || isTyping}
            style={{ 
              boxSizing: 'border-box', width: '46px', height: '46px', borderRadius: '50%', backgroundColor: '#000000', color: '#ffffff', 
              border: '3px solid #1d172b', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.6)', padding: 0
            }}
            aria-label="New conversation"
            title="New Chat"
          >
            <Plus size={22} aria-hidden="true" />
          </button>
        </div>

        {/* Chat list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: '5px', marginTop: '75px', flex: 1 }}>
          {chats.map((chat) => (
            <div 
              key={chat.id}
              role="button" tabIndex={0} aria-pressed={chat.id === activeChatId}
              onKeyDown={(e) => { if (!isTyping && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActiveChatId(chat.id); if (isMobile) setIsSidebarOpen(false); } }}
              onClick={() => { if (isTyping) return; setActiveChatId(chat.id); if (isMobile) setIsSidebarOpen(false); }}
              style={{ 
                backgroundColor: chat.id === activeChatId ? '#44325f' : '#000000', color: '#ffffff', 
                padding: '10px 12px 10px 18px', borderRadius: '24px', display: 'flex', justifyContent: 'space-between', 
                alignItems: 'center', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', border: chat.id === activeChatId ? '1px solid #77618f' : '1px solid transparent'
              }}
            >
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{chat.title}</span>
              <button
                aria-label={`Options for ${chat.title}`}
                onClick={(e) => {
                  e.stopPropagation(); 
                  if (chatMenu && chatMenu.id === chat.id) setChatMenu(null); 
                  else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    chatOptionsTriggerRef.current = e.currentTarget;
                    setChatMenu({ id: chat.id, title: chat.title, top: rect.bottom + 8, left: rect.left - 80 });
                  }
                }}
                style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#2d243f', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        {/* User profile footer */}
        <div style={{ backgroundColor: '#161222', borderRadius: '16px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', marginTop: '15px', flexShrink: 0 }}>
          <div style={{ position: 'relative', width: '42px', height: '42px', flexShrink: 0 }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#77618f', position: 'absolute', top: 0, left: 0, zIndex: 1 }} />
            <UserRound size={24} aria-hidden="true" style={{ position: 'absolute', top: 9, left: 9, zIndex: 2 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left' }}>
            <span style={{ fontWeight: 'bold', fontSize: '15px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', lineHeight: '1.2' }}>Your study workspace</span>
            <span style={{ fontSize: '12px', color: '#c4b6d4', marginTop: '2px' }}>Learn with P.E.D.R.O</span>
          </div>
        </div>
      </aside>

      {/* Keep the edge control outside the inert sidebar so it can reopen it. */}
      <button type="button" className="pedro-sidebar-edge" style={{ left: isSidebarOpen ? '280px' : '0' }}
        aria-label={isSidebarOpen ? 'Close conversations sidebar' : 'Open conversations sidebar'}
        aria-controls="pedro-conversations" aria-expanded={isSidebarOpen}
        onClick={() => setIsSidebarOpen(open => !open)}>
        {isSidebarOpen ? <span className="pedro-sidebar-grip" aria-hidden="true"><span /><span /><span /></span> : <ChevronRight size={16} aria-hidden="true" />}
      </button>

      {/* ================= MAIN CHAT AREA ================= */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1d172b', position: 'relative', overflow: 'hidden', zIndex: 10, boxSizing: 'border-box' }}>
        
        <header className="pedro-header">
          <button type="button" onClick={onBack} className="pedro-back"><ArrowLeft size={17} aria-hidden="true" /> Back to S.H.A.R.E</button>
        </header>

        {/* Message list (or empty-state hero text) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '80px 20px 20px 20px', display: 'flex', flexDirection: 'column', justifyContent: messages.length === 0 ? 'center' : 'flex-start', alignItems: messages.length === 0 ? 'center' : 'flex-start', width: '100%', boxSizing: 'border-box' }}>
          {messages.length === 0 ? (
            <div className="message-animate" style={{ fontSize: 'clamp(36px, 8vw, 56px)', color: '#ffffff', fontWeight: 'bold', textAlign: 'center', letterSpacing: '-1px' }}>
              {`Let's study, ${currentUser?.name?.trim() || 'Student'}!`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '20px', width: '100%', maxWidth: '850px', margin: '0 auto' }}>
              {messages.length > renderedMessages.length && <p className="pedro-history-window" role="status">Showing the 100 most recent messages.</p>}
              {renderedMessages.map((msg, index) => {
                const isPendingBotBubble = msg.role === 'bot' && msg.text === '' && index === renderedMessages.length - 1 && isTyping;
                return (
                  <div key={msg.id || `${msg.createdAt || 'message'}-${index}`} className="message-animate" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', width: '100%' }}>
                    <div style={{ background: msg.role === 'user' ? '#2d243f' : '#302641', color: '#ffffff', padding: '14px 18px', borderRadius: '16px', maxWidth: '85%', fontSize: '15px', lineHeight: '1.6', textAlign: 'left', boxSizing: 'border-box' }}>
                      <div style={{ fontSize: '11px', color: '#b0b0b0', marginBottom: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{msg.role === 'user' ? 'You' : 'PEDRO'}</span>
                        {msg.role === 'bot' && typeof msg.duration === 'number' && (
                          <span style={{ color: '#b4a1c9', fontWeight: 'normal' }}>· {msg.duration.toFixed(1)}s</span>
                        )}
                      </div>
                      {/* Inline image thumbnail for image attachments sent by the user */}
                      {msg.role === 'user' && msg.image && (
                        <img
                          src={msg.image}
                          alt={msg.fileName || 'Attached image'}
                          style={{
                            display: 'block',
                            maxWidth: '280px',
                            maxHeight: '280px',
                            width: '100%',
                            objectFit: 'cover',
                            borderRadius: '12px',
                            marginBottom: msg.text ? '10px' : 0
                          }}
                        />
                      )}
                      {isPendingBotBubble ? (
                        <ThinkingIndicator craftingQuiz={msg.pendingKind === 'quiz'} />
                      ) : (
                        msg.text && (
                          <div className="markdown-content">
                            <ReactMarkdown skipHtml remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, maxExpand: 1000 }]]}>
                              {msg.text}
                            </ReactMarkdown>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ================= INPUT BAR ================= */}
        <div style={{ padding: '10px 20px 20px 20px', display: 'flex', justifyContent: 'center', flexShrink: 0, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', display: 'flex', width: '100%', maxWidth: '850px', backgroundColor: '#2d243f', borderRadius: '24px', padding: '8px 12px 8px 14px', alignItems: 'center', gap: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.4)', boxSizing: 'border-box' }}>
            
            {/* Pending attachment preview (image thumbnail or file-name chip) */}
            {chatFile && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: '15px', background: '#444', padding: chatFilePreview ? '8px' : '6px 12px', borderRadius: '16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #77618f', zIndex: 20 }}>
                {chatFilePreview ? (
                  <>
                    <img src={chatFilePreview} alt={chatFile.name} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '10px' }} />
                    <span style={{ maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chatFile.name}</span>
                  </>
                ) : (
                  <>📄 {chatFile.name}</>
                )}
                <button aria-label="Remove attachment" onClick={() => setChatFile(null)} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '16px', padding: 0, display: 'flex', alignItems: 'center' }}>✖</button>
              </div>
            )}

            {/* "+" menu: create quiz / upload file */}
            {showInputMenu && (
              <div className="input-floating-menu" style={{ 
                position: 'absolute', bottom: 'calc(100% + 10px)', left: '10px', 
                backgroundColor: '#241c35', border: '1px solid #444', borderRadius: '12px', 
                padding: '6px', width: '180px', zIndex: 100, boxShadow: '0 8px 16px rgba(0,0,0,0.6)' 
              }}>
                <button type="button" className="pedro-input-action"
                  onClick={() => { setShowQuizModal(true); setShowInputMenu(false); }} 
                  style={{ padding: '10px 12px', fontSize: '14px', cursor: 'pointer', borderRadius: '8px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}
                  onMouseOver={(e) => e.target.style.background = '#2d243f'}
                  onMouseOut={(e) => e.target.style.background = 'transparent'}
                >
                  📝 Create a Quiz
                </button>
                
                {/* Visual Divider */}
                <div style={{ height: '1px', background: '#444', margin: '4px 0' }} />
                
                {/* Upload File Button */}
                <label 
                  style={{ padding: '10px 12px', fontSize: '14px', cursor: 'pointer', borderRadius: '8px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}
                  onMouseOver={(e) => e.target.style.background = '#2d243f'}
                  onMouseOut={(e) => e.target.style.background = 'transparent'}
                >
                  📄 Upload File
                  <input 
                    type="file" 
                    style={{ display: 'none' }} 
                    accept=".pdf,.txt,.docx,image/*" 
                    onChange={(e) => {
                      if(e.target.files[0]) {
                        setChatFile(e.target.files[0]);
                        setShowInputMenu(false);
                      }
                    }} 
                  />
                </label>
              </div>
            )}

            <button 
              aria-label="Attach a file or create a quiz"
              ref={quizTriggerRef}
              aria-expanded={showInputMenu}
              disabled={isTyping}
              className="plus-button"
              onClick={() => setShowInputMenu(!showInputMenu)}
              style={{ background: '#44325f', border: 'none', borderRadius: '50%', width: '38px', height: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}
            >
              <Plus size={20} aria-hidden="true" />
            </button>

            <textarea 
              aria-label="Message PEDRO"
              ref={textareaRef}
              value={input} 
              onChange={handleTyping} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault(); 
                  sendMessage();
                }
              }} 
              disabled={isTyping}
              rows={1}
              style={{ 
                flexGrow: 1, 
                border: 'none', 
                outline: 'none', 
                fontSize: '15px', 
                padding: '8px 6px', 
                backgroundColor: 'transparent', 
                color: '#ffffff', 
                minWidth: 0,
                resize: 'none',
                overflowY: 'auto',
                lineHeight: '1.4',
                maxHeight: '150px' 
              }} 
              placeholder={isTyping ? "PEDRO is thinking..." : "Ask me anything!"} 
            />

            <button 
              aria-label="Send message"
              className="send-btn" 
              onClick={sendMessage} 
              disabled={isTyping || (!input.trim() && !chatFile)} 
              style={{ 
                background: '#ffffff', color: '#000000', border: 'none', borderRadius: '50%', 
                width: '38px', height: '38px', cursor: isTyping ? 'default' : 'pointer', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                fontSize: '16px', fontWeight: 'bold', flexShrink: 0, opacity: isTyping ? 0.5 : 1, boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
              }}
            >
              <ArrowUp size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ================= CHAT OPTIONS MENU (rename/delete) ================= */}
      {historyError && <div className="pedro-history-notice" role="alert">{historyError} <button type="button" onClick={retryHistory}>Retry</button></div>}
      {!historyReady && !historyError && <div className="pedro-history-notice" role="status">Loading your conversations…</div>}
      {chatMenu && (
        <div className="floating-chat-menu" style={{ position: 'fixed', top: chatMenu.top, left: chatMenu.left, backgroundColor: '#161222', border: '1px solid #444', borderRadius: '12px', padding: '6px', width: '130px', zIndex: 9999, boxShadow: '0 8px 16px rgba(0,0,0,0.6)' }}>
          <button type="button" className="pedro-chat-menu-action" onClick={(e) => { e.stopPropagation(); renameChat(chatMenu.id, chatMenu.title); }}>Rename</button>
          <button type="button" className="pedro-chat-menu-action pedro-delete-action" onClick={(e) => { e.stopPropagation(); deleteChat(chatMenu.id); }}>Delete</button>
        </div>
      )}

      {renameTarget && <RenameChatDialog key={renameTarget.id} title={renameTarget.title} onCancel={closeRenameDialog} onSave={title => {
        setChats(previous => previous.map(chat => chat.id === renameTarget.id ? { ...chat, title } : chat));
        closeRenameDialog();
      }} />}

      {/* ================= QUIZ CREATION MODAL ================= */}
      {showQuizModal && (
        <QuizDialog labelledBy="pedro-quiz-title" onCancel={() => setShowQuizModal(false)} returnFocusRef={quizTriggerRef}>
          <div style={{ backgroundColor: '#241c35', padding: '25px', borderRadius: '16px', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', gap: '15px', color: '#ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 id="pedro-quiz-title">Create a Mock Quiz</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', color: '#b0b0b0' }}>Source Material (Topic or File)</label>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                  type="file" 
                  accept=".pdf,.txt,.docx,image/*" 
                  onChange={(e) => setQuizFile(e.target.files[0])} 
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #444', background: '#161222', color: '#fff', fontSize: '12px' }}
                />
                {quizFile && (
                  <button aria-label="Remove quiz attachment" onClick={() => setQuizFile(null)} style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '18px' }}>✖</button>
                )}
              </div>

              {quizFile ? (
                <input 
                  type="text" 
                  placeholder="Which page, chapter, or specific topic from the file?" 
                  aria-label="Instructions for quiz file"
                  value={fileInstructions} 
                  onChange={(e) => setFileInstructions(e.target.value)} 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid #444', background: '#161222', color: '#fff', marginTop: '5px' }} 
                />
              ) : (
                <input 
                  type="text" 
                  placeholder="e.g. Intro to Psychology" 
                  aria-label="Quiz topic"
                  value={quizTopic} 
                  onChange={(e) => setQuizTopic(e.target.value)} 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid #444', background: '#161222', color: '#fff', marginTop: '5px' }} 
                />
              )}
            </div>

            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', color: '#b0b0b0' }}>Total Items (Max 15)</label>
                <select aria-label="Total quiz questions" value={quizItems} onChange={(e) => setQuizItems(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #444', background: '#161222', color: '#fff' }}>{[...Array(15)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}</select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', color: '#b0b0b0' }}>Parts (Max 3)</label>
                <select aria-label="Number of quiz parts" value={quizParts} onChange={(e) => setQuizParts(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #444', background: '#161222', color: '#fff' }}>{[1, 2, 3].map((num) => <option key={num} value={num}>{num}</option>)}</select>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: '#222', borderRadius: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Question Types per Part</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[...Array(parseInt(quizParts))].map((_, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <label style={{ fontSize: '11px', color: '#c4b6d4' }}>Part {i + 1}</label>
                    <select aria-label={`Question type for part ${i + 1}`} value={partTypes[i] || 'multiple choice'} onChange={(e) => setPartTypes({...partTypes, [i]: e.target.value})} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#161222', color: '#fff', fontSize: '12px' }}>
                      <option value="multiple choice">Multiple Choice</option>
                      <option value="true or false">True or False</option>
                      <option value="enumeration">Enumeration</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: '#222', borderRadius: '8px' }}>
              <label style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                <input type="checkbox" checked={enableTimer} onChange={(e) => setEnableTimer(e.target.checked)} /> Enable Timer per Part
              </label>
              {enableTimer && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[...Array(parseInt(quizParts))].map((_, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <label style={{ fontSize: '11px', color: '#c4b6d4' }}>Part {i + 1} (mins)</label>
                      <input aria-label={`Minutes for part ${i + 1}`} type="number" min="1" max="60" value={timePerPart[i]} onChange={(e) => setTimePerPart({...timePerPart, [i]: parseInt(e.target.value) || 1})} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#161222', color: '#fff' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '5px' }}>
              <button onClick={() => setShowQuizModal(false)} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid #77618f', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={startQuizGeneration} style={{ padding: '10px 20px', background: '#ffffff', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Let's Start!</button>
            </div>
          </div>
        </QuizDialog>
      )}

      {/* ================= ACTIVE QUIZ SESSION MODAL ================= */}
      {activeQuizData && (
        <QuizDialog label="Active practice quiz" onCancel={cancelQuiz} returnFocusRef={quizTriggerRef} active>
          <div style={{ position: 'relative', backgroundColor: '#222', padding: '25px', borderRadius: '16px', width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px', color: '#ffffff', border: '1px solid #444', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <button aria-label="Cancel quiz" onClick={cancelQuiz} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: '#c4b6d4', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', background: '#333', padding: '4px 10px', borderRadius: '6px', color: '#c4b6d4', fontWeight: 'bold' }}>{activeQuizData.parts[currentPartIndex].partTitle}</span>
                {enableTimer && <span style={{ fontSize: '13px', color: timeLeft <= 10 ? '#ff4d4d' : '#4dff88', fontWeight: 'bold' }}>⏱ {formatTime(timeLeft)}</span>}
              </div>
              <span style={{ fontSize: '14px', color: '#c4b6d4' }}>Question {currentQIndex + 1} of {activeQuizData.parts[currentPartIndex].questions.length}</span>
            </div>
            <h3 style={{ fontSize: '18px', lineHeight: '1.5' }}>{activeQuizData.parts[currentPartIndex].questions[currentQIndex].question}</h3>
            {(Array.isArray(activeQuizData.parts[currentPartIndex].questions[currentQIndex].options) && activeQuizData.parts[currentPartIndex].questions[currentQIndex].options.length > 0) || activeQuizData.parts[currentPartIndex].partTitle.toLowerCase().includes('true') ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(activeQuizData.parts[currentPartIndex].questions[currentQIndex].options?.length ? activeQuizData.parts[currentPartIndex].questions[currentQIndex].options : ["True", "False"]).map((opt, oIdx) => (
                  <button key={oIdx} onClick={() => setSelectedAnswer(opt)} style={{ padding: '12px 16px', textAlign: 'left', borderRadius: '8px', border: 'none', cursor: 'pointer', backgroundColor: selectedAnswer === opt ? '#ffffff' : '#2f2f2f', color: selectedAnswer === opt ? '#000000' : '#ffffff', fontWeight: selectedAnswer === opt ? 'bold' : 'normal' }}>{opt}</button>
                ))}
              </div>
            ) : (
              <input aria-label="Your quiz answer" type="text" placeholder="Type your answer and press Enter..." autoFocus value={enumInput} onChange={(e) => setEnumInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleNextQuestion()} style={{ padding: '14px', borderRadius: '8px', border: '1px solid #444', background: '#161222', color: '#fff', fontSize: '16px' }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button onClick={() => handleNextQuestion()} style={{ padding: '12px 24px', background: '#ffffff', color: '#000000', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                {currentQIndex === activeQuizData.parts[currentPartIndex].questions.length - 1 && currentPartIndex === activeQuizData.parts.length - 1 ? 'Finish Quiz' : 'Next Question'}
              </button>
            </div>
          </div>
        </QuizDialog>
      )}
    </div>
  );
}

export default Chatbot;
