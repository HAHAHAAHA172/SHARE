import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './App.css';

function App() {
  const [input, setInput] = useState('');
  
  const [chats, setChats] = useState([
    { id: 1, title: 'New Conversation', messages: [] }
  ]);
  const [activeChatId, setActiveChatId] = useState(1);
  
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  const [chatMenu, setChatMenu] = useState(null); 
  const [showInputMenu, setShowInputMenu] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
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

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : 'https://share-cn0y.onrender.com';

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];
  const messages = activeChat.messages;

  // --- Response timing ---
  const [liveElapsed, setLiveElapsed] = useState(0);
  const responseStartRef = useRef(null);

  useEffect(() => {
    if (!isTyping) return;
    const tick = setInterval(() => {
      if (responseStartRef.current) {
        setLiveElapsed((Date.now() - responseStartRef.current) / 1000);
      }
    }, 100);
    return () => clearInterval(tick);
  }, [isTyping]);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
      setWindowHeight(window.innerHeight);
      if (window.innerWidth > 768) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
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
  }, [chatMenu, showInputMenu]);

  useEffect(() => {
    if (activeQuizData && enableTimer && timeLeft > 0) {
      const timerId = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearTimeout(timerId);
    } else if (activeQuizData && enableTimer && timeLeft === 0) {
      handleNextQuestion(true);
    }
  }, [activeQuizData, enableTimer, timeLeft]);

  const createNewChat = () => {
    const newChatObj = { id: Date.now(), title: 'New Conversation', messages: [] };
    setChats(prev => [newChatObj, ...prev]);
    setActiveChatId(newChatObj.id);
  };

  const deleteChat = (id) => {
    if (chats.length === 1) {
      alert("You cannot delete your only conversation!");
      setChatMenu(null);
      return;
    }
    const updatedChats = chats.filter(c => c.id !== id);
    setChats(updatedChats);
    if (activeChatId === id) setActiveChatId(updatedChats[0].id);
    setChatMenu(null);
  };

  const renameChat = (id, currentTitle) => {
    const newTitle = window.prompt("Enter a new name for this chat:", currentTitle);
    if (newTitle && newTitle.trim()) {
      setChats(prev => prev.map(c => c.id === id ? { ...c, title: newTitle.trim() } : c));
    }
    setChatMenu(null);
  };

  const updateActiveChatMessages = (newMessages, customTitle = null) => {
    setChats(prevChats => prevChats.map(chat => {
      if (chat.id === activeChatId) {
        let title = chat.title;
        if (customTitle) {
          title = customTitle;
        } else if (chat.title === 'New Conversation' && newMessages.length > 0) {
          title = newMessages[0].text.slice(0, 20) + (newMessages[0].text.length > 20 ? '...' : '');
        }
        return { ...chat, messages: newMessages, title };
      }
      return chat;
    }));
  };

  // --- Handle Auto-resizing Text Input ---
  const handleTyping = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  // --- STREAMING CHAT CONSUMER ---
  const sendMessage = async () => {
    if (!input.trim() || isTyping || sendingRef.current) return;
    sendingRef.current = true;
    const userMsgText = input;
    const newMessages = [...messages, { role: 'user', text: userMsgText }];
    updateActiveChatMessages(newMessages);
    
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setIsTyping(true);
    responseStartRef.current = Date.now();
    setLiveElapsed(0);

    const slidingWindowHistory = newMessages.slice(-6);
    updateActiveChatMessages([...newMessages, { role: 'bot', text: '' }]);

    let botReply = '';
    let pending = '';
    let flushTimer = null;

    const flush = () => {
      if (pending) {
        botReply += pending;
        pending = '';
        updateActiveChatMessages([...newMessages, { role: 'bot', text: botReply }]);
      }
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsgText, history: slidingWindowHistory }),
      });

      if (!response.ok) throw new Error('Network stream error');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                pending += parsed.text;
                if (!flushTimer) {
                  flushTimer = setTimeout(() => { flush(); flushTimer = null; }, 50);
                }
              } else if (parsed.error) {
                if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
                pending = '';
                botReply = parsed.error;
                updateActiveChatMessages([...newMessages, { role: 'bot', text: botReply }]);
              }
            } catch (e) {}
          }
        }
      }

      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      flush();
      const finalDuration = responseStartRef.current ? (Date.now() - responseStartRef.current) / 1000 : null;
      updateActiveChatMessages([...newMessages, { role: 'bot', text: botReply, duration: finalDuration }]);
    } catch (error) {
      console.error(error);
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      const finalDuration = responseStartRef.current ? (Date.now() - responseStartRef.current) / 1000 : null;
      updateActiveChatMessages([...newMessages, { role: 'bot', text: "Sorry, I ran into an error connecting to PEDRO.", duration: finalDuration }]);
    } finally {
      setIsTyping(false);
      sendingRef.current = false;
    }
  };

  const startQuizGeneration = async () => {
    setShowQuizModal(false);
    setIsTyping(true);
    const quizUserMsg = { role: 'user', text: `Create a mock quiz about: ${quizTopic || 'General Knowledge'} (${quizItems} items, ${quizParts} parts)` };
    const updatedMsgs = [...messages, quizUserMsg];
    updateActiveChatMessages(updatedMsgs, `Quiz: ${quizTopic || 'General Knowledge'}`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/quiz/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topic: quizTopic, items: parseInt(quizItems), parts: parseInt(quizParts), partTypes: partTypes 
        }),
      });

      const data = await response.json();
      
      if (!data || !data.parts || data.parts.length === 0) {
        throw new Error("Invalid quiz structure returned from server.");
      }
      
      setActiveQuizData(data);
      setCurrentPartIndex(0);
      setCurrentQIndex(0);
      setUserAnswers({});
      setSelectedAnswer('');
      setEnumInput('');
      
      if (enableTimer) setTimeLeft((timePerPart[0] || 5) * 60);

      updateActiveChatMessages([...updatedMsgs, { role: 'bot', text: `✨ Quiz generated successfully! Launching **${data.title}** now...` }]);
    } catch (error) {
      console.error('Quiz loading error:', error);
      setActiveQuizData(null);
      updateActiveChatMessages([...updatedMsgs, { role: 'bot', text: "Sorry, I encountered an error parsing the quiz structure. Please try generating again." }]);
    } finally {
      setIsTyping(false);
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
    setLiveElapsed(0);

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
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: promptForPedro, history: updatedMessages.slice(-6) })
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                pending += parsed.text;
                if (!flushTimer) {
                  flushTimer = setTimeout(() => { flush(); flushTimer = null; }, 50);
                }
              }
            } catch (e) {}
          }
        }
      }

      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      flush();
      const finalDuration = responseStartRef.current ? (Date.now() - responseStartRef.current) / 1000 : null;
      updateActiveChatMessages([...updatedMessages, { role: 'bot', text: botReply, duration: finalDuration }]);
    } catch (error) {
      console.error(error);
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      const finalDuration = responseStartRef.current ? (Date.now() - responseStartRef.current) / 1000 : null;
      updateActiveChatMessages([...updatedMessages, { role: 'bot', text: "Sorry, I ran into an error while evaluating your quiz results!", duration: finalDuration }]);
    } finally {
      setIsTyping(false);
    }
  };

  const cancelQuiz = () => {
    setActiveQuizData(null);
    updateActiveChatMessages([...messages, { role: 'bot', text: "🚫 Quiz was cancelled." }]);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div style={{ 
      position: 'fixed', top: 0, left: 0, width: '100%', 
      height: isMobile ? `${windowHeight}px` : '100vh', 
      display: 'flex', flexDirection: 'row', fontFamily: 'system-ui, -apple-system, sans-serif', 
      backgroundColor: '#1e1e1e', color: '#ffffff', overflow: 'hidden' 
    }}>
      
      {/* Sidebar */}
      <div style={{ 
        width: '280px', flexShrink: 0, backgroundColor: '#383838', display: 'flex', flexDirection: 'column', 
        padding: '20px 15px', position: isMobile ? 'absolute' : 'relative', height: '100%',
        left: isMobile ? (isSidebarOpen ? '0' : '-280px') : 'auto',
        marginLeft: !isMobile ? (isSidebarOpen ? '0' : '-280px') : '0',
        transition: 'margin-left 0.3s ease, left 0.3s ease', zIndex: 50, boxSizing: 'border-box'
      }}>
        
        <div style={{ 
          position: 'absolute', left: 0, top: '25px', backgroundColor: '#ffffff', color: '#000000', 
          padding: '10px 24px 10px 18px', borderRadius: '0 28px 28px 0', fontWeight: '900', 
          fontSize: '22px', letterSpacing: '1.5px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 30
        }}>
          P.E.D.R.O
        </div>

        <div style={{ position: 'absolute', right: isSidebarOpen ? '-23px' : '-70px', top: '20px', zIndex: 30, transition: 'right 0.3s ease' }}>
          <button 
            onClick={createNewChat}
            style={{ 
              boxSizing: 'border-box', width: '46px', height: '46px', borderRadius: '50%', backgroundColor: '#000000', color: '#ffffff', 
              border: '3px solid #262626', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.6)', padding: 0
            }}
            title="New Chat"
          >
            <img src="/icons/new-chat.png" alt="New Chat" style={{ width: '22px', height: '22px', objectFit: 'contain' }} onError={(e)=>{e.target.style.display='none'}} />
          </button>
        </div>

        <div style={{ position: 'absolute', right: '-16px', top: '50%', transform: 'translateY(-50%)', zIndex: 40 }}>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{ 
              width: '32px', height: '72px', borderRadius: '16px', backgroundColor: '#383838', border: '1px solid #555', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ffffff', gap: '3px'
            }}
            title="Toggle Sidebar"
          >
            {isSidebarOpen ? (
              <>
                <div style={{ width: '2px', height: '24px', backgroundColor: '#aaa', borderRadius: '2px' }} />
                <div style={{ width: '2px', height: '24px', backgroundColor: '#aaa', borderRadius: '2px' }} />
                <div style={{ width: '2px', height: '24px', backgroundColor: '#aaa', borderRadius: '2px' }} />
              </>
            ) : (
              <span style={{ fontSize: '18px', fontWeight: '900', color: '#aaa', marginLeft: '12px' }}>❯</span>
            )}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: '5px', marginTop: '75px', flex: 1 }}>
          {chats.map((chat) => (
            <div 
              key={chat.id} 
              onClick={() => { setActiveChatId(chat.id); if (isMobile) setIsSidebarOpen(false); }}
              style={{ 
                backgroundColor: chat.id === activeChatId ? '#2a2a2a' : '#000000', color: '#ffffff', 
                padding: '10px 12px 10px 18px', borderRadius: '24px', display: 'flex', justifyContent: 'space-between', 
                alignItems: 'center', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', border: chat.id === activeChatId ? '1px solid #555' : '1px solid transparent'
              }}
            >
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{chat.title}</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation(); 
                  if (chatMenu && chatMenu.id === chat.id) setChatMenu(null); 
                  else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setChatMenu({ id: chat.id, title: chat.title, top: rect.bottom + 8, left: rect.left - 80 });
                  }
                }}
                style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#383838', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <img src="/icons/chat-dots.png" alt="options" style={{ width: '16px', height: '16px', objectFit: 'contain' }} onError={(e)=>{e.target.style.display='none'}} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: '#1e1e1e', borderRadius: '16px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', marginTop: '15px', flexShrink: 0 }}>
          <div style={{ position: 'relative', width: '42px', height: '42px', flexShrink: 0 }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#555', position: 'absolute', top: 0, left: 0, zIndex: 1 }} />
            <img src="/icons/user-photo.jpg" alt="User" style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, zIndex: 2 }} onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left' }}>
            <span style={{ fontWeight: 'bold', fontSize: '15px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', lineHeight: '1.2' }}>Prince Joey Agramon</span>
            <span style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>BScpE - 3A</span>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#262626', position: 'relative', overflow: 'hidden', zIndex: 10, boxSizing: 'border-box' }}>
        
        <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 15 }}>
          <button style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#383838', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
            <img src="/icons/menu-dots.png" alt="menu" style={{ width: '22px', height: '22px', objectFit: 'contain' }} onError={(e)=>{e.target.style.display='none'}} />
          </button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '80px 20px 20px 20px', display: 'flex', flexDirection: 'column', justifyContent: messages.length === 0 ? 'center' : 'flex-start', alignItems: messages.length === 0 ? 'center' : 'flex-start', width: '100%', boxSizing: 'border-box' }}>
          {messages.length === 0 ? (
            <div className="message-animate" style={{ fontSize: 'clamp(36px, 8vw, 56px)', color: '#ffffff', fontWeight: 'bold', textAlign: 'center', letterSpacing: '-1px' }}>
              Let’s Study!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '20px', width: '100%', maxWidth: '850px', margin: '0 auto' }}>
              {messages.map((msg, index) => {
                const isPendingBotBubble = msg.role === 'bot' && msg.text === '' && index === messages.length - 1 && isTyping;
                return (
                  <div key={index} className="message-animate" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', width: '100%' }}>
                    <div style={{ background: msg.role === 'user' ? '#383838' : '#3c3c3c', color: '#ffffff', padding: '14px 18px', borderRadius: '16px', maxWidth: '85%', fontSize: '15px', lineHeight: '1.6', textAlign: 'left', boxSizing: 'border-box' }}>
                      <div style={{ fontSize: '11px', color: '#b0b0b0', marginBottom: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{msg.role === 'user' ? 'You' : 'PEDRO'}</span>
                        {msg.role === 'bot' && typeof msg.duration === 'number' && (
                          <span style={{ color: '#777', fontWeight: 'normal' }}>· {msg.duration.toFixed(1)}s</span>
                        )}
                      </div>
                      {isPendingBotBubble ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '14px' }}>
                          <span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span>
                          <span style={{ fontSize: '11px', color: '#888' }}>{liveElapsed.toFixed(1)}s</span>
                        </div>
                      ) : (
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div style={{ padding: '10px 20px 20px 20px', display: 'flex', justifyContent: 'center', flexShrink: 0, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', display: 'flex', width: '100%', maxWidth: '850px', backgroundColor: '#383838', borderRadius: '24px', padding: '8px 12px 8px 14px', alignItems: 'center', gap: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.4)', boxSizing: 'border-box' }}>
            
            {showInputMenu && (
              <div className="input-floating-menu" style={{ 
                position: 'absolute', bottom: 'calc(100% + 10px)', left: '10px', 
                backgroundColor: '#2b2b2b', border: '1px solid #444', borderRadius: '12px', 
                padding: '8px', width: '180px', zIndex: 100, boxShadow: '0 8px 16px rgba(0,0,0,0.6)' 
              }}>
                <div 
                  onClick={() => { setShowQuizModal(true); setShowInputMenu(false); }} 
                  style={{ padding: '10px 12px', fontSize: '14px', cursor: 'pointer', borderRadius: '8px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  📝 Create a Quiz
                </div>
              </div>
            )}

            <button 
              className="plus-button"
              onClick={() => setShowInputMenu(!showInputMenu)}
              style={{ background: '#2e2e2e', border: 'none', borderRadius: '50%', width: '38px', height: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}
            >
              <img src="/icons/more-options.png" alt="More Options" style={{ width: '18px', height: '18px', objectFit: 'contain' }} onError={(e)=>{e.target.style.display='none'}} />
            </button>

            <textarea 
              ref={textareaRef}
              value={input} 
              onChange={handleTyping} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
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
              placeholder={isTyping ? "PEDRO is thinking..." : "What are we going to study?"} 
            />

            <button 
              className="send-btn" 
              onClick={sendMessage} 
              disabled={isTyping} 
              style={{ 
                background: '#ffffff', color: '#000000', border: 'none', borderRadius: '50%', 
                width: '38px', height: '38px', cursor: isTyping ? 'default' : 'pointer', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                fontSize: '16px', fontWeight: 'bold', flexShrink: 0, opacity: isTyping ? 0.5 : 1, boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
              }}
            >
              ↑
            </button>
          </div>
        </div>
      </div>

      {chatMenu && (
        <div className="floating-chat-menu" style={{ position: 'fixed', top: chatMenu.top, left: chatMenu.left, backgroundColor: '#1e1e1e', border: '1px solid #444', borderRadius: '12px', padding: '6px', width: '130px', zIndex: 9999, boxShadow: '0 8px 16px rgba(0,0,0,0.6)' }}>
          <div onClick={(e) => { e.stopPropagation(); renameChat(chatMenu.id, chatMenu.title); }} style={{ padding: '8px', fontSize: '15px', cursor: 'pointer', borderRadius: '6px', color: '#ffffff' }}>Rename</div>
          <div onClick={(e) => { e.stopPropagation(); deleteChat(chatMenu.id); }} style={{ padding: '8px', fontSize: '15px', cursor: 'pointer', borderRadius: '6px', color: '#ff4d4d', marginTop: '4px' }}>Delete</div>
        </div>
      )}

      {showQuizModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: '#2b2b2b', padding: '25px', borderRadius: '16px', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', gap: '15px', color: '#ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>Create a Mock Quiz</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', color: '#b0b0b0' }}>Topic / Subject Material</label>
              <input type="text" placeholder="e.g. Intro to Psychology" value={quizTopic} onChange={(e) => setQuizTopic(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #444', background: '#1e1e1e', color: '#fff' }} />
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', color: '#b0b0b0' }}>Total Items (Max 15)</label>
                <select value={quizItems} onChange={(e) => setQuizItems(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #444', background: '#1e1e1e', color: '#fff' }}>{[...Array(15)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}</select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', color: '#b0b0b0' }}>Parts (Max 3)</label>
                <select value={quizParts} onChange={(e) => setQuizParts(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #444', background: '#1e1e1e', color: '#fff' }}>{[1, 2, 3].map((num) => <option key={num} value={num}>{num}</option>)}</select>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: '#222', borderRadius: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Question Types per Part</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[...Array(parseInt(quizParts))].map((_, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <label style={{ fontSize: '11px', color: '#aaa' }}>Part {i + 1}</label>
                    <select value={partTypes[i] || 'multiple choice'} onChange={(e) => setPartTypes({...partTypes, [i]: e.target.value})} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#1e1e1e', color: '#fff', fontSize: '12px' }}>
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
                      <label style={{ fontSize: '11px', color: '#aaa' }}>Part {i + 1} (mins)</label>
                      <input type="number" min="1" max="60" value={timePerPart[i]} onChange={(e) => setTimePerPart({...timePerPart, [i]: parseInt(e.target.value) || 1})} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#1e1e1e', color: '#fff' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '5px' }}>
              <button onClick={() => setShowQuizModal(false)} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={startQuizGeneration} style={{ padding: '10px 20px', background: '#ffffff', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Let's Start!</button>
            </div>
          </div>
        </div>
      )}

      {activeQuizData && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', backgroundColor: '#222', padding: '25px', borderRadius: '16px', width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px', color: '#ffffff', border: '1px solid #444', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={cancelQuiz} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', background: '#333', padding: '4px 10px', borderRadius: '6px', color: '#aaa', fontWeight: 'bold' }}>{activeQuizData.parts[currentPartIndex].partTitle}</span>
                {enableTimer && <span style={{ fontSize: '13px', color: timeLeft <= 10 ? '#ff4d4d' : '#4dff88', fontWeight: 'bold' }}>⏱ {formatTime(timeLeft)}</span>}
              </div>
              <span style={{ fontSize: '14px', color: '#aaa' }}>Question {currentQIndex + 1} of {activeQuizData.parts[currentPartIndex].questions.length}</span>
            </div>
            <h3 style={{ fontSize: '18px', lineHeight: '1.5' }}>{activeQuizData.parts[currentPartIndex].questions[currentQIndex].question}</h3>
            {(Array.isArray(activeQuizData.parts[currentPartIndex].questions[currentQIndex].options) && activeQuizData.parts[currentPartIndex].questions[currentQIndex].options.length > 0) || activeQuizData.parts[currentPartIndex].partTitle.toLowerCase().includes('true') ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(activeQuizData.parts[currentPartIndex].questions[currentQIndex].options || ["True", "False"]).map((opt, oIdx) => (
                  <button key={oIdx} onClick={() => setSelectedAnswer(opt)} style={{ padding: '12px 16px', textAlign: 'left', borderRadius: '8px', border: 'none', cursor: 'pointer', backgroundColor: selectedAnswer === opt ? '#ffffff' : '#2f2f2f', color: selectedAnswer === opt ? '#000000' : '#ffffff', fontWeight: selectedAnswer === opt ? 'bold' : 'normal' }}>{opt}</button>
                ))}
              </div>
            ) : (
              <input type="text" placeholder="Type your answer and press Enter..." autoFocus value={enumInput} onChange={(e) => setEnumInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleNextQuestion()} style={{ padding: '14px', borderRadius: '8px', border: '1px solid #444', background: '#1e1e1e', color: '#fff', fontSize: '16px' }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button onClick={() => handleNextQuestion()} style={{ padding: '12px 24px', background: '#ffffff', color: '#000000', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                {currentQIndex === activeQuizData.parts[currentPartIndex].questions.length - 1 && currentPartIndex === activeQuizData.parts.length - 1 ? 'Finish Quiz' : 'Next Question'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;