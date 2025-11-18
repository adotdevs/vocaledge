const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../config/config.env') });

class VoiceInteraction {
    constructor() {
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.deepgramApiKey = process.env.DEEPGRAM_API_KEY;
        this.useDeepgramStreaming = process.env.USE_DEEPGRAM_STREAMING === 'true';
        this.audioBuffer = new Map();
        this.conversationState = new Map();
        this.activeRuns = new Map(); // Track active runs per thread to prevent concurrent operations
    }

    // Text-to-Speech using OpenAI TTS
    async textToSpeech(text, voice = 'alloy') {
        // Available voices: alloy, echo, fable, onyx, nova, shimmer
        try {
            console.log(`Converting to speech: "${text}"`);
            
            const response = await axios.post('https://api.openai.com/v1/audio/speech', {
                model: "tts-1",
                voice: voice,
                input: text,
                response_format: "mp3"
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer'
            });

            const buffer = Buffer.from(response.data);
            return buffer;
        } catch (error) {
            console.error('TTS Error:', error);
            throw error;
        }
    }

    // Convert MP3 audio to PCM/G.711 μ-law for RTP streaming
    async convertToRTPAudio(mp3Buffer) {
        try {
            console.log('🎵 Converting MP3 to PCM/G.711 μ-law for RTP streaming...');
            
            return new Promise((resolve, reject) => {
                const tempMp3File = path.join(__dirname, `temp_${Date.now()}.mp3`);
                const tempPcmFile = path.join(__dirname, `temp_${Date.now()}.pcm`);
                
                // Write MP3 buffer to temporary file
                fs.writeFileSync(tempMp3File, mp3Buffer);
                
                // Convert MP3 to PCM/G.711 μ-law using ffmpeg
                ffmpeg(tempMp3File)
                    .format('mulaw')           // G.711 μ-law format
                    .audioChannels(1)          // Mono
                    .audioFrequency(8000)      // 8kHz sample rate
                    .audioBitrate('64k')       // 64kbps bitrate
                    .on('end', () => {
                        try {
                            // Read the converted PCM data
                            const pcmBuffer = fs.readFileSync(tempPcmFile);
                            
                            // Clean up temporary files
                            fs.unlinkSync(tempMp3File);
                            fs.unlinkSync(tempPcmFile);
                            
                            console.log(`✅ Audio conversion completed: ${pcmBuffer.length} bytes`);
                            resolve(pcmBuffer);
                        } catch (error) {
                            console.error('❌ Error reading converted audio:', error);
                            reject(error);
                        }
                    })
                    .on('error', (error) => {
                        console.error('❌ FFmpeg conversion error:', error);
                        console.log('🔄 Falling back to simulated audio for testing...');
                        
                        // Clean up temporary files
                        try {
                            fs.unlinkSync(tempMp3File);
                            fs.unlinkSync(tempPcmFile);
                        } catch (cleanupError) {
                            console.error('❌ Error cleaning up temp files:', cleanupError);
                        }
                        
                        // Fallback: Generate simulated PCM audio for testing
                        const simulatedPCM = this.generateSimulatedPCM();
                        console.log(`✅ Simulated PCM audio generated: ${simulatedPCM.length} bytes`);
                        resolve(simulatedPCM);
                    })
                    .save(tempPcmFile);
            });
        } catch (error) {
            console.error('❌ Audio conversion failed, using fallback:', error);
            // Fallback: Generate simulated PCM audio
            const simulatedPCM = this.generateSimulatedPCM();
            return simulatedPCM;
        }
    }

    // Generate simulated PCM audio for testing when ffmpeg is not available
    generateSimulatedPCM() {
        console.log('🎵 Generating simulated PCM audio for testing...');
        
        // Generate 3 seconds of simulated audio (8000 Hz * 3 = 24000 samples)
        const duration = 3; // seconds
        const sampleRate = 8000;
        const samples = sampleRate * duration;
        const buffer = Buffer.alloc(samples);
        
        // Generate a simple sine wave pattern (simulated speech)
        for (let i = 0; i < samples; i++) {
            // Create a simple audio pattern that sounds like speech
            const frequency = 440 + Math.sin(i / 100) * 100; // Varying frequency
            const amplitude = Math.sin(i * frequency / sampleRate * 2 * Math.PI) * 0.3;
            const sample = Math.floor((amplitude + 1) * 127.5); // Convert to 0-255 range
            buffer[i] = sample;
        }
        
        console.log(`✅ Simulated PCM generated: ${buffer.length} bytes (${duration}s)`);
        return buffer;
    }

    // Generate audio for RTP streaming (MP3 + PCM versions)
    async generateRTPAudio(text, voice = 'shimmer') {
        try {
            console.log(`🎵 Generating RTP audio for: "${text}"`);
            
            // Step 1: Generate MP3 using OpenAI TTS
            const mp3Buffer = await this.textToSpeech(text, voice);
            console.log(`📊 MP3 generated: ${mp3Buffer.length} bytes`);
            
            // Step 2: Convert MP3 to PCM/G.711 μ-law for RTP
            const pcmBuffer = await this.convertToRTPAudio(mp3Buffer);
            console.log(`📊 PCM/G.711 generated: ${pcmBuffer.length} bytes`);
            
            return {
                mp3: mp3Buffer,    // For storage/playback
                pcm: pcmBuffer,    // For RTP streaming
                duration: pcmBuffer.length / 8000, // Duration in seconds (8kHz)
                text: text
            };
        } catch (error) {
            console.error('❌ RTP audio generation failed:', error);
            throw error;
        }
    }

    /**
     * Speech-to-Text using Deepgram streaming (PRIORITY) or OpenAI Whisper (fallback only)
     * @param {Buffer} audioBuffer - Audio buffer for Whisper fallback (only if Deepgram fails)
     * @param {string} transcript - Transcript from Deepgram streaming (PRIORITY - if available)
     * @returns {Promise<string>} Transcribed text
     */
    async speechToText(audioBuffer, transcript = null) {
        // PRIORITY: If we already have a transcript from Deepgram streaming, use it
        if (transcript && transcript.trim().length > 0) {
            console.log(`✅ Using Deepgram transcript (PRIORITY): "${transcript}"`);
            console.log(`   ⚠️ Skipping Whisper/GPT transcription to save time and cost`);
            return transcript;
        }
        
        // FALLBACK ONLY: Use Whisper if Deepgram transcript is not available
        console.log(`⚠️ Deepgram transcript not available, falling back to Whisper...`);
        return this.speechToTextWhisper(audioBuffer);
    }

    // Speech-to-Text using OpenAI Whisper (FALLBACK ONLY - used when Deepgram fails)
    async speechToTextWhisper(audioBuffer) {
        try {
            // Verify API key is set
            if (!this.openaiApiKey) {
                console.error('❌ OPENAI_API_KEY is not set! Cannot transcribe speech.');
                throw new Error('OpenAI API key is missing');
            }

            console.log('🎤 Converting speech to text with Whisper...');
            console.log(`   Audio buffer size: ${audioBuffer.length} bytes`);
            console.log(`   API Key: ${this.openaiApiKey ? '✅ Set' : '❌ Missing'}`);
            
            const FormData = require('form-data');
            const formData = new FormData();
            
            // Create a buffer from the audio data
            formData.append('file', audioBuffer, {
                filename: 'audio.wav',
                contentType: 'audio/wav'
            });
            formData.append('model', 'whisper-1');
            formData.append('language', 'en');
            formData.append('response_format', 'json');

            console.log('📤 Sending audio to OpenAI Whisper API...');
            const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            if (!response.data || !response.data.text) {
                console.error('❌ Invalid response from Whisper API:', response.data);
                throw new Error('Invalid response from Whisper API');
            }

            const text = response.data.text || '';
            console.log(`✅ Recognized speech: "${text}"`);
            return text;
        } catch (error) {
            console.error('❌ STT Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            if (error.request) {
                console.error('   Request made but no response received');
            }
            throw error;
        }
    }

    // Generate AI response using OpenAI Assistant API
    async generateVoiceResponse(userText, sessionId = 'default', leadInfo = {}) {
        try {
            // Verify API key is set
            if (!this.openaiApiKey) {
                console.error('❌ OPENAI_API_KEY is not set! Cannot generate response.');
                throw new Error('OpenAI API key is missing');
            }

            const assistantId = process.env.OPENAI_ASSISTANT_ID || process.env.ASSISTANT_ID;
            if (!assistantId) {
                console.error('❌ OPENAI_ASSISTANT_ID is not set! Cannot use Assistant API.');
                throw new Error('OpenAI Assistant ID is missing');
            }

            console.log(`\n🤖 Generating AI response using Assistant API for: "${userText}"`);
            console.log(`   Session: ${sessionId}`);
            console.log(`   Assistant ID: ${assistantId}`);
            if (leadInfo.firstName) {
                console.log(`   Lead Name: ${leadInfo.firstName} ${leadInfo.lastName || ''}`);
            }

            // Get or create thread for this session
            let threadId = this.conversationState.get(`${sessionId}_threadId`);
            
            if (!threadId) {
                // Create new thread
                console.log(`📝 Creating new Assistant thread for session ${sessionId}...`);
                const threadResponse = await axios.post('https://api.openai.com/v1/threads', {}, {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json',
                        'OpenAI-Beta': 'assistants=v2'
                    }
                });
                threadId = threadResponse.data.id;
                this.conversationState.set(`${sessionId}_threadId`, threadId);
                console.log(`✅ Thread created: ${threadId}`);
            }

            // Check for active runs BEFORE adding message or creating run
            // This prevents "Can't add messages while run is active" errors
            // Check both our internal map and query the thread directly
            let activeRunFound = false;
            let activeRunId = null;
            
            // First check our internal map
            const activeRun = this.activeRuns.get(threadId);
            if (activeRun) {
                activeRunFound = true;
                activeRunId = activeRun.runId;
            } else {
                // Also check thread directly for any active runs (catches race conditions)
                try {
                    const runsResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs?limit=1`, {
                        headers: {
                            'Authorization': `Bearer ${this.openaiApiKey}`,
                            'OpenAI-Beta': 'assistants=v2'
                        }
                    });
                    
                    const runs = runsResponse.data.data;
                    if (runs && runs.length > 0) {
                        const latestRun = runs[0];
                        if (latestRun.status === 'queued' || latestRun.status === 'in_progress') {
                            activeRunFound = true;
                            activeRunId = latestRun.id;
                            // Store it in our map
                            this.activeRuns.set(threadId, { runId: latestRun.id, status: latestRun.status, startTime: Date.now() });
                        }
                    }
                } catch (error) {
                    // If we can't check, proceed normally
                    console.log(`ℹ️ Could not check thread runs: ${error.message}`);
                }
            }
            
            // If active run found, wait for it to complete and retrieve response
            if (activeRunFound && activeRunId) {
                console.log(`⏳ Active run detected: ${activeRunId}, waiting for completion (max 3s)...`);
                try {
                    let attempts = 0;
                    let currentStatus = 'in_progress';
                    const maxAttempts = 20; // 2 seconds max (20 * 100ms)
                    const pollInterval = 100; // Faster polling (100ms instead of 500ms)
                    
                    while (currentStatus !== 'completed' && currentStatus !== 'failed' && currentStatus !== 'cancelled' && attempts < maxAttempts) {
                        const statusResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${activeRunId}`, {
                            headers: {
                                'Authorization': `Bearer ${this.openaiApiKey}`,
                                'OpenAI-Beta': 'assistants=v2'
                            }
                        });

                        currentStatus = statusResponse.data.status;
                        
                        if (currentStatus === 'completed') {
                            break; // Exit loop immediately
                        }
                        
                        if (attempts < maxAttempts - 1) {
                            await new Promise(resolve => setTimeout(resolve, pollInterval));
                        }
                        attempts++;
                        
                        // Log every 5 attempts (0.5 seconds)
                        if (attempts % 5 === 0) {
                            console.log(`   Run status: ${currentStatus} (${attempts * pollInterval}ms elapsed)`);
                        }
                    }

                    if (currentStatus === 'completed') {
                        console.log(`✅ Run completed - retrieving existing response`);
                        this.activeRuns.delete(threadId);
                        
                        const messagesResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1`, {
                            headers: {
                                'Authorization': `Bearer ${this.openaiApiKey}`,
                                'OpenAI-Beta': 'assistants=v2'
                            }
                        });

                        const messages = messagesResponse.data.data;
                        if (messages && messages.length > 0 && messages[0].role === 'assistant') {
                            const assistantMessage = messages[0];
                            let aiResponse = '';
                            
                            if (assistantMessage.content && assistantMessage.content.length > 0) {
                                const contentItem = assistantMessage.content[0];
                                if (contentItem.type === 'text') {
                                    aiResponse = contentItem.text.value;
                                }
                            }

                            if (aiResponse && aiResponse.trim().length > 0) {
                                console.log(`✅ Retrieved existing assistant response: "${aiResponse}"`);
                                return aiResponse;
                            }
                        }
                    } else if (currentStatus === 'failed' || currentStatus === 'cancelled') {
                        console.log(`⚠️ Active run ${currentStatus}, clearing and proceeding`);
                        this.activeRuns.delete(threadId);
                    } else {
                        console.warn(`⚠️ Run still in progress after 3s wait, clearing and proceeding`);
                        this.activeRuns.delete(threadId);
                    }
                } catch (error) {
                    console.error(`❌ Error checking active run: ${error.message}`);
                    this.activeRuns.delete(threadId);
                }
            }

            // Add user message to thread (only if no active run or run was cleared)
            console.log(`📤 Adding user message to thread...`);
            try {
                await axios.post(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                    role: 'user',
                    content: userText
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json',
                        'OpenAI-Beta': 'assistants=v2'
                    }
                });
            } catch (error) {
                // If we get "active run" error, wait briefly and try to retrieve response
                if (error.response && error.response.status === 400 && 
                    error.response.data && error.response.data.error &&
                    error.response.data.error.message && 
                    error.response.data.error.message.includes('active run')) {
                    
                    console.log(`⚠️ Got active run error when adding message, checking thread for active run...`);
                    
                    // Query thread for active runs
                    try {
                        const runsResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs?limit=1`, {
                            headers: {
                                'Authorization': `Bearer ${this.openaiApiKey}`,
                                'OpenAI-Beta': 'assistants=v2'
                            }
                        });
                        
                        const runs = runsResponse.data.data;
                        if (runs && runs.length > 0) {
                            const latestRun = runs[0];
                            if (latestRun.status === 'queued' || latestRun.status === 'in_progress') {
                                console.log(`⏳ Found active run: ${latestRun.id}, waiting for completion (max 3s)...`);
                                
                                let attempts = 0;
                                let currentStatus = latestRun.status;
                                const maxAttempts = 20; // 2 seconds max (20 * 100ms)
                                const pollInterval = 100; // Faster polling (100ms instead of 500ms)
                                
                                while (currentStatus !== 'completed' && currentStatus !== 'failed' && currentStatus !== 'cancelled' && attempts < maxAttempts) {
                                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                                    attempts++;

                                    const checkResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${latestRun.id}`, {
                                        headers: {
                                            'Authorization': `Bearer ${this.openaiApiKey}`,
                                            'OpenAI-Beta': 'assistants=v2'
                                        }
                                    });

                                    currentStatus = checkResponse.data.status;
                                    
                                    if (currentStatus === 'completed') {
                                        // Retrieve response
                                        const messagesResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1`, {
                                            headers: {
                                                'Authorization': `Bearer ${this.openaiApiKey}`,
                                                'OpenAI-Beta': 'assistants=v2'
                                            }
                                        });

                                        const messages = messagesResponse.data.data;
                                        if (messages && messages.length > 0 && messages[0].role === 'assistant') {
                                            const assistantMessage = messages[0];
                                            let aiResponse = '';
                                            
                                            if (assistantMessage.content && assistantMessage.content.length > 0) {
                                                const contentItem = assistantMessage.content[0];
                                                if (contentItem.type === 'text') {
                                                    aiResponse = contentItem.text.value;
                                                }
                                            }

                                            if (aiResponse && aiResponse.trim().length > 0) {
                                                console.log(`✅ Retrieved assistant response after active run error: "${aiResponse}"`);
                                                return aiResponse;
                                            }
                                        }
                                        break;
                                    }
                                }
                                
                                if (currentStatus !== 'completed') {
                                    throw new Error(`Active run did not complete after 3s wait`);
                                }
                            }
                        }
                    } catch (retryError) {
                        console.error(`❌ Error handling active run: ${retryError.message}`);
                        throw error; // Re-throw original error
                    }
                } else {
                    throw error; // Re-throw if not an active run error
                }
            }

            // Check again for active run BEFORE creating a new run
            // This prevents race conditions where early GPT created a run
            const checkActiveRun = this.activeRuns.get(threadId);
            if (checkActiveRun) {
                console.log(`⏳ Active run detected before creating new run: ${checkActiveRun.runId}, checking status...`);
                try {
                    const statusResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${checkActiveRun.runId}`, {
                        headers: {
                            'Authorization': `Bearer ${this.openaiApiKey}`,
                            'OpenAI-Beta': 'assistants=v2'
                        }
                    });

                    const runStatus = statusResponse.data.status;
                    
                    if (runStatus === 'completed') {
                        console.log(`✅ Active run already completed - retrieving existing response`);
                        this.activeRuns.delete(threadId);
                        
                        const messagesResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1`, {
                            headers: {
                                'Authorization': `Bearer ${this.openaiApiKey}`,
                                'OpenAI-Beta': 'assistants=v2'
                            }
                        });

                        const messages = messagesResponse.data.data;
                        if (messages && messages.length > 0 && messages[0].role === 'assistant') {
                            const assistantMessage = messages[0];
                            let aiResponse = '';
                            
                            if (assistantMessage.content && assistantMessage.content.length > 0) {
                                const contentItem = assistantMessage.content[0];
                                if (contentItem.type === 'text') {
                                    aiResponse = contentItem.text.value;
                                }
                            }

                            if (aiResponse && aiResponse.trim().length > 0) {
                                console.log(`✅ Retrieved existing assistant response: "${aiResponse}"`);
                                return aiResponse;
                            }
                        }
                    } else if (runStatus === 'failed' || runStatus === 'cancelled') {
                        console.log(`⚠️ Active run ${runStatus}, clearing and proceeding`);
                        this.activeRuns.delete(threadId);
                    } else {
                        // Run is still in progress - wait for it to complete (max 3 seconds)
                        console.log(`⏳ Active run in progress (${runStatus}), waiting for completion (max 3s)...`);
                        let attempts = 0;
                        let currentStatus = runStatus;
                        const maxAttempts = 20; // 2 seconds max (20 * 100ms)
                        const pollInterval = 100; // Faster polling (100ms instead of 500ms)
                        while (currentStatus !== 'completed' && currentStatus !== 'failed' && currentStatus !== 'cancelled' && attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, pollInterval));
                            attempts++;

                            const checkResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${checkActiveRun.runId}`, {
                                headers: {
                                    'Authorization': `Bearer ${this.openaiApiKey}`,
                                    'OpenAI-Beta': 'assistants=v2'
                                }
                            });

                            currentStatus = checkResponse.data.status;
                            if (attempts % 2 === 0) {
                                console.log(`   Run status: ${currentStatus} (waiting ${attempts * 0.5}s)`);
                            }
                        }

                        if (currentStatus === 'completed') {
                            console.log(`✅ Run completed during wait - retrieving existing response`);
                            this.activeRuns.delete(threadId);
                            
                            const messagesResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1`, {
                                headers: {
                                    'Authorization': `Bearer ${this.openaiApiKey}`,
                                    'OpenAI-Beta': 'assistants=v2'
                                }
                            });

                            const messages = messagesResponse.data.data;
                            if (messages && messages.length > 0 && messages[0].role === 'assistant') {
                                const assistantMessage = messages[0];
                                let aiResponse = '';
                                
                                if (assistantMessage.content && assistantMessage.content.length > 0) {
                                    const contentItem = assistantMessage.content[0];
                                    if (contentItem.type === 'text') {
                                        aiResponse = contentItem.text.value;
                                    }
                                }

                                if (aiResponse && aiResponse.trim().length > 0) {
                                    console.log(`✅ Retrieved assistant response: "${aiResponse}"`);
                                    return aiResponse;
                                }
                            }
                        } else {
                            console.warn(`⚠️ Run still in progress after 3s wait, clearing and proceeding`);
                            this.activeRuns.delete(threadId);
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error checking active run before creating new run: ${error.message}`);
                    this.activeRuns.delete(threadId);
                }
            }
            
            // Also check if there's an active run by querying the thread directly
            // This catches cases where the run was created but not yet in our map
            try {
                const runsResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs?limit=1`, {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'OpenAI-Beta': 'assistants=v2'
                    }
                });
                
                const runs = runsResponse.data.data;
                if (runs && runs.length > 0) {
                    const latestRun = runs[0];
                    if (latestRun.status === 'queued' || latestRun.status === 'in_progress') {
                        // There's an active run - wait for it or retrieve result
                        console.log(`⏳ Found active run in thread: ${latestRun.id} (${latestRun.status}), waiting for completion...`);
                        
                        // Store it in our map
                        this.activeRuns.set(threadId, { runId: latestRun.id, status: latestRun.status, startTime: Date.now() });
                        
                        // Wait for completion (max 2 seconds with faster polling)
                        let attempts = 0;
                        let currentStatus = latestRun.status;
                        const maxAttempts = 20; // 2 seconds max (20 * 100ms)
                        const pollInterval = 100; // Faster polling (100ms instead of 500ms)
                        while (currentStatus !== 'completed' && currentStatus !== 'failed' && currentStatus !== 'cancelled' && attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, pollInterval));
                            attempts++;

                            const checkResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${latestRun.id}`, {
                                headers: {
                                    'Authorization': `Bearer ${this.openaiApiKey}`,
                                    'OpenAI-Beta': 'assistants=v2'
                                }
                            });

                            currentStatus = checkResponse.data.status;
                        }

                        if (currentStatus === 'completed') {
                            console.log(`✅ Run completed - retrieving existing response`);
                            this.activeRuns.delete(threadId);
                            
                            const messagesResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1`, {
                                headers: {
                                    'Authorization': `Bearer ${this.openaiApiKey}`,
                                    'OpenAI-Beta': 'assistants=v2'
                                }
                            });

                            const messages = messagesResponse.data.data;
                            if (messages && messages.length > 0 && messages[0].role === 'assistant') {
                                const assistantMessage = messages[0];
                                let aiResponse = '';
                                
                                if (assistantMessage.content && assistantMessage.content.length > 0) {
                                    const contentItem = assistantMessage.content[0];
                                    if (contentItem.type === 'text') {
                                        aiResponse = contentItem.text.value;
                                    }
                                }

                                if (aiResponse && aiResponse.trim().length > 0) {
                                    console.log(`✅ Retrieved assistant response: "${aiResponse}"`);
                                    return aiResponse;
                                }
                            }
                        } else {
                            console.warn(`⚠️ Run still in progress after 3s, clearing and proceeding`);
                            this.activeRuns.delete(threadId);
                        }
                    }
                }
            } catch (error) {
                // If we can't check runs, proceed normally
                console.log(`ℹ️ Could not check thread runs: ${error.message}`);
            }

            // Create run to get assistant response
            console.log(`🔄 Creating run with Assistant...`);
            const runResponse = await axios.post(`https://api.openai.com/v1/threads/${threadId}/runs`, {
                assistant_id: assistantId
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                }
            });

            const runId = runResponse.data.id;
            console.log(`✅ Run created: ${runId}`);
            
            // Track active run to prevent concurrent operations
            this.activeRuns.set(threadId, { runId, status: 'queued', startTime: Date.now() });

            // Poll for run completion with faster polling (200ms intervals for faster response)
            let runStatus = 'queued';
            let attempts = 0;
            const maxAttempts = 50; // 10 seconds max wait (50 * 200ms)
            const pollInterval = 200; // Faster polling (200ms instead of 1000ms)

            while (runStatus !== 'completed' && runStatus !== 'failed' && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                attempts++;

                const statusResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'OpenAI-Beta': 'assistants=v2'
                    }
                });

                runStatus = statusResponse.data.status;
                
                // Update active run status
                const activeRun = this.activeRuns.get(threadId);
                if (activeRun && activeRun.runId === runId) {
                    activeRun.status = runStatus;
                }
                
                // Log every 5 attempts (1 second)
                if (attempts % 5 === 0) {
                    console.log(`   Run status: ${runStatus} (${attempts * pollInterval}ms elapsed)`);
                }

                if (runStatus === 'failed') {
                    const error = statusResponse.data.last_error;
                    // Clear active run on failure
                    this.activeRuns.delete(threadId);
                    throw new Error(error?.message || 'Assistant run failed');
                }
            }

            if (runStatus !== 'completed') {
                // Clear active run if not completed
                this.activeRuns.delete(threadId);
                throw new Error(`Assistant run did not complete. Status: ${runStatus}`);
            }
            
            // Clear active run on successful completion
            this.activeRuns.delete(threadId);

            // Retrieve assistant messages
            console.log(`📥 Retrieving assistant response...`);
            const messagesResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1`, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'OpenAI-Beta': 'assistants=v2'
                }
            });

            const messages = messagesResponse.data.data;
            if (!messages || messages.length === 0 || messages[0].role !== 'assistant') {
                throw new Error('No assistant response received');
            }

            // Extract text content from assistant message
            const assistantMessage = messages[0];
            let aiResponse = '';
            
            if (assistantMessage.content && assistantMessage.content.length > 0) {
                const contentItem = assistantMessage.content[0];
                if (contentItem.type === 'text') {
                    aiResponse = contentItem.text.value;
                }
            }

            if (!aiResponse || aiResponse.trim().length === 0) {
                throw new Error('Empty assistant response received');
            }

            console.log(`✅ Assistant response received: "${aiResponse}"`);
            return aiResponse;

        } catch (error) {
            console.error('❌ Assistant API Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            throw error; // Re-throw so caller can handle it
        }
    }

    // Generate initial greeting using Assistant API (NO hardcoded fallbacks)
    async generateInitialGreeting(sessionId = 'default', leadInfo = {}, retryCount = 0) {
        const maxRetries = 3;
        
        try {
            const assistantId = process.env.OPENAI_ASSISTANT_ID || process.env.ASSISTANT_ID;
            if (!assistantId) {
                throw new Error('OPENAI_ASSISTANT_ID is not set in environment variables. Please configure it in config.env');
            }

            if (!this.openaiApiKey) {
                throw new Error('OPENAI_API_KEY is not set in environment variables. Please configure it in config.env');
            }

            console.log(`\n🤖 Generating initial greeting using Assistant API (attempt ${retryCount + 1}/${maxRetries + 1})`);
            if (leadInfo.firstName) {
                console.log(`   Lead Name: ${leadInfo.firstName} ${leadInfo.lastName || ''}`);
            }

            // Get or create thread
            let threadId = this.conversationState.get(`${sessionId}_threadId`);
            
            if (!threadId) {
                const threadResponse = await axios.post('https://api.openai.com/v1/threads', {}, {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json',
                        'OpenAI-Beta': 'assistants=v2'
                    }
                });
                threadId = threadResponse.data.id;
                this.conversationState.set(`${sessionId}_threadId`, threadId);
                console.log(`✅ Created new thread: ${threadId}`);
            }

            // Check for active run before adding greeting message
            const activeRun = this.activeRuns.get(threadId);
            if (activeRun) {
                console.log(`⏳ Active run detected before greeting, checking status...`);
                try {
                    const statusResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${activeRun.runId}`, {
                        headers: {
                            'Authorization': `Bearer ${this.openaiApiKey}`,
                            'OpenAI-Beta': 'assistants=v2'
                        }
                    });

                    const runStatus = statusResponse.data.status;
                    
                    if (runStatus === 'completed' || runStatus === 'failed' || runStatus === 'cancelled') {
                        console.log(`✅ Active run ${runStatus}, proceeding with greeting`);
                        this.activeRuns.delete(threadId);
                    } else {
                        // Wait briefly (max 1 second) for completion with faster polling
                        console.log(`⏳ Active run in progress (${runStatus}), waiting briefly...`);
                        let attempts = 0;
                        let currentStatus = runStatus;
                        const maxAttempts = 10; // 1 second max (10 * 100ms)
                        const pollInterval = 100; // Faster polling (100ms instead of 500ms)
                        while (currentStatus !== 'completed' && currentStatus !== 'failed' && currentStatus !== 'cancelled' && attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, pollInterval));
                            attempts++;
                            const checkResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${activeRun.runId}`, {
                                headers: {
                                    'Authorization': `Bearer ${this.openaiApiKey}`,
                                    'OpenAI-Beta': 'assistants=v2'
                                }
                            });
                            currentStatus = checkResponse.data.status;
                        }
                        this.activeRuns.delete(threadId);
                    }
                } catch (error) {
                    console.error(`❌ Error checking active run: ${error.message}`);
                    this.activeRuns.delete(threadId);
                }
            }

            // Create a more specific greeting prompt that ensures Assistant generates a proper greeting
            let greetingPrompt;
            if (leadInfo.firstName) {
                greetingPrompt = `You are starting a phone call with ${leadInfo.firstName}${leadInfo.lastName ? ` ${leadInfo.lastName}` : ''}. Please provide a friendly, professional greeting to start the conversation. Make it natural and conversational, not robotic.`;
            } else {
                greetingPrompt = `You are starting a phone call. Please provide a friendly, professional greeting to start the conversation. Make it natural and conversational, not robotic.`;
            }

            // Add lead context if available
            if (leadInfo.email || leadInfo.company || leadInfo.brand) {
                const contextParts = [];
                if (leadInfo.company || leadInfo.brand) {
                    contextParts.push(`They are from ${leadInfo.company || leadInfo.brand}`);
                }
                if (leadInfo.country) {
                    contextParts.push(`located in ${leadInfo.country}`);
                }
                if (contextParts.length > 0) {
                    greetingPrompt += ` Context: ${contextParts.join(', ')}.`;
                }
            }

            console.log(`📤 Sending greeting prompt to Assistant...`);
            await axios.post(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                role: 'user',
                content: greetingPrompt
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                }
            });

            // Create run
            console.log(`🔄 Creating Assistant run...`);
            const runResponse = await axios.post(`https://api.openai.com/v1/threads/${threadId}/runs`, {
                assistant_id: assistantId
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                }
            });

            const runId = runResponse.data.id;
            
            // Track active run
            this.activeRuns.set(threadId, { runId, status: 'queued', startTime: Date.now() });
            console.log(`✅ Run created: ${runId}`);

            // Poll for completion with longer timeout for greeting
            let runStatus = 'queued';
            let attempts = 0;
            const maxPollAttempts = 40; // 40 seconds max wait for greeting
            
            while (runStatus !== 'completed' && runStatus !== 'failed' && attempts < maxPollAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;

                const statusResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'OpenAI-Beta': 'assistants=v2'
                    }
                });

                runStatus = statusResponse.data.status;
                
                if (attempts % 5 === 0) {
                    console.log(`   Run status: ${runStatus} (${attempts}/${maxPollAttempts})`);
                }

                if (runStatus === 'failed') {
                    const error = statusResponse.data.last_error;
                    // Clear active run on failure
                    this.activeRuns.delete(threadId);
                    throw new Error(error?.message || 'Assistant run failed');
                }
                
                // Update active run status
                const activeRun = this.activeRuns.get(threadId);
                if (activeRun && activeRun.runId === runId) {
                    activeRun.status = runStatus;
                }
            }

            if (runStatus !== 'completed') {
                // Clear active run if not completed
                this.activeRuns.delete(threadId);
                throw new Error(`Greeting generation did not complete. Status: ${runStatus} after ${attempts} seconds`);
            }
            
            // Clear active run on successful completion
            this.activeRuns.delete(threadId);

            // Get response
            console.log(`📥 Retrieving greeting from Assistant...`);
            const messagesResponse = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1`, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'OpenAI-Beta': 'assistants=v2'
                }
            });

            const messages = messagesResponse.data.data;
            if (messages && messages.length > 0 && messages[0].role === 'assistant') {
                const contentItem = messages[0].content[0];
                if (contentItem.type === 'text') {
                    const greeting = contentItem.text.value.trim();
                    if (greeting && greeting.length > 0) {
                        console.log(`✅ Greeting generated from Assistant: "${greeting}"`);
                        return greeting;
                    } else {
                        throw new Error('Assistant returned empty greeting');
                    }
                } else {
                    throw new Error(`Unexpected content type: ${contentItem.type}`);
                }
            } else {
                throw new Error('No assistant response found in messages');
            }

        } catch (error) {
            console.error(`❌ Error generating greeting (attempt ${retryCount + 1}):`, error.message);
            
            // Retry logic - retry up to maxRetries times
            if (retryCount < maxRetries) {
                console.log(`🔄 Retrying greeting generation... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
                return this.generateInitialGreeting(sessionId, leadInfo, retryCount + 1);
            }
            
            // If all retries failed, throw error (no hardcoded fallback)
            throw new Error(`Failed to generate greeting from Assistant after ${maxRetries + 1} attempts: ${error.message}`);
        }
    }

    // Process voice conversation
    async processVoiceConversation(audioBuffer, sessionId = 'default') {
        try {
            // Step 1: Convert speech to text
            const userText = await this.speechToText(audioBuffer);
            
            // Step 2: Generate AI response
            const aiResponse = await this.generateVoiceResponse(userText, sessionId);
            
            // Step 3: Convert response to speech
            const audioResponse = await this.textToSpeech(aiResponse);
            
            return {
                userText: userText,
                aiResponse: aiResponse,
                audioResponse: audioResponse
            };
        } catch (error) {
            console.error('Voice conversation error:', error);
            throw error;
        }
    }

    /**
     * Generate call summary using GPT
     * @param {string} prompt - Summary generation prompt
     * @returns {Promise<string>} Generated summary
     */
    async generateSummary(prompt) {
        try {
            // Verify API key is set
            if (!this.openaiApiKey) {
                console.error('❌ OPENAI_API_KEY is not set! Cannot generate summary.');
                throw new Error('OpenAI API key is missing');
            }

            console.log(`📝 Generating call summary with GPT...`);
            
            const messages = [
                {
                    role: "system",
                    content: "You are a professional call analyst. Generate concise, professional summaries of phone conversations."
                },
                {
                    role: "user",
                    content: prompt
                }
            ];

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4o-mini",
                messages: messages,
                max_tokens: 500,
                temperature: 0.3 // Lower temperature for more consistent summaries
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.data || !response.data.choices || !response.data.choices[0]) {
                console.error('❌ Invalid response from OpenAI API:', response.data);
                throw new Error('Invalid response from OpenAI API');
            }

            const summary = response.data.choices[0].message.content;
            console.log(`✅ Summary generated: ${summary.length} characters`);
            return summary;

        } catch (error) {
            console.error('❌ Summary Generation Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            throw error;
        }
    }

    // Simulate voice conversation for testing (removed hardcoded messages - now uses Assistant API)
    async simulateVoiceConversation(sessionId = 'default', leadInfo = {}) {
        // This method is deprecated - all responses now come from Assistant API
        // Keeping for backward compatibility but it will use Assistant API
        console.log('⚠️ simulateVoiceConversation is deprecated - using Assistant API instead');
        
        try {
            const greeting = await this.generateInitialGreeting(sessionId, leadInfo);
            console.log(`Bot says: "${greeting}"`);
            const audio = await this.textToSpeech(greeting);
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.error('Error in simulated conversation:', error);
        }
    }

    // Get conversation state
    getConversationState(sessionId) {
        return this.conversationState.get(sessionId) || [];
    }

    // Clear conversation state
    clearConversationState(sessionId) {
        this.conversationState.delete(sessionId);
    }

    // Extract lead information from conversation
    extractLeadInfo(conversationHistory) {
        const leadInfo = {
            name: null,
            email: null,
            phone: null,
            company: null,
            requirements: null,
            appointmentRequested: false
        };

        const fullConversation = conversationHistory.map(msg => msg.content).join(' ');

        // Extract email
        const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
        const emailMatch = fullConversation.match(emailRegex);
        if (emailMatch) leadInfo.email = emailMatch[1];

        // Extract phone
        const phoneRegex = /(\+?[\d\s\-\(\)]{10,})/;
        const phoneMatch = fullConversation.match(phoneRegex);
        if (phoneMatch) leadInfo.phone = phoneMatch[1];

        // Check for appointment request
        if (fullConversation.toLowerCase().includes('schedule') || 
            fullConversation.toLowerCase().includes('demo') ||
            fullConversation.toLowerCase().includes('appointment')) {
            leadInfo.appointmentRequested = true;
        }

        return leadInfo;
    }
}

module.exports = VoiceInteraction;
