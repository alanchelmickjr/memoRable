import"winston";import t from"ws";import"redis";import"mongodb";let e=null;const s={admiration:"#ffc58f",adoration:"#ffc6cc",aestheticAppreciation:"#e2cbff",amusement:"#febf52",anger:"#b21816",annoyance:"#ffffff",anxiety:"#6e42cc",awe:"#7dabd3",awkwardness:"#d7d99d",boredom:"#a4a4a4",calmness:"#a9cce1",concentration:"#336cff",contemplation:"#b0aeef",confusion:"#c66a26",contempt:"#76842d",contentment:"#e5c6b4",craving:"#54591c",determination:"#ff5c00",disappointment:"#006c7c",disapproval:"#ffffff",disgust:"#1a7a41",distress:"#c5f264",doubt:"#998644",ecstasy:"#ff48a4",embarrassment:"#63c653",empathicPain:"#ca5555",enthusiasm:"#ffffff",entrancement:"#7554d6",envy:"#1d4921",excitement:"#fff974",fear:"#d1c9ef",gratitude:"#ffffff",guilt:"#879aa1",horror:"#772e7a",interest:"#a9cce1",joy:"#ffd600",love:"#f44f4c",neutral:"#879aa1",nostalgia:"#b087a1",pain:"#8c1d1d",pride:"#9a4cb6",realization:"#217aa8",relief:"#fe927a",romance:"#f0cc86",sadness:"#305575",sarcasm:"#ffffff",satisfaction:"#a6ddaf",sexualDesire:"#aa0d59",shame:"#8a6262",surprise:"#70e63a",surpriseNegative:"#70e63a",surprisePositive:"#7affff",sympathy:"#7f88e0",tiredness:"#757575",triumph:"#ec8132"};Object.keys(s).length;const a=t=>{const e=s[t];return e?[parseInt(e.slice(1,3),16)/255,parseInt(e.slice(3,5),16)/255,parseInt(e.slice(5,7),16)/255]:null},i=t=>{if(!t||3!==t.length)return"neutral";const e=t=>{const e=Math.round(255*t).toString(16);return 1===e.length?"0"+e:e},a=`#${e(t[0])}${e(t[1])}${e(t[2])}`;let i="neutral",n=1/0;for(const[t,e]of Object.entries(s)){const s=o(a,e);s<n&&(n=s,i=t)}return i},o=(t,e)=>{const s=parseInt(t.slice(1,3),16),a=parseInt(t.slice(3,5),16),i=parseInt(t.slice(5,7),16),o=parseInt(e.slice(1,3),16),n=parseInt(e.slice(3,5),16),r=parseInt(e.slice(5,7),16);return Math.sqrt(Math.pow(s-o,2)+Math.pow(a-n,2)+Math.pow(i-r,2))},n=new class{constructor(){this.ws=null,this.apiKey=process.env.HUME_API_KEY,this.endpoint=process.env.HUME_ENDPOINT,this.isConnected=!1,this.activeStreams=new Map,this.messageQueue=[],this.processingQueue=!1,this.lastActivityTime=Date.now(),this.inactivityTimeout=6e4,this.reconnectAttempts=0,this.maxReconnectAttempts=5,this.reconnectDelay=1e3}async connect(s={}){if(!this.apiKey)throw new Error("Hume API key not configured");return new Promise(((a,i)=>{try{const i=new URLSearchParams({apiKey:this.apiKey,...s}),o=`${this.endpoint}?${i.toString()}`;this.ws=new t(o),this.ws.on("open",(()=>{e.info("Connected to Hume.ai websocket"),this.isConnected=!0,this.reconnectAttempts=0,this.reconnectDelay=1e3,this.setupInactivityCheck(),a()})),this.ws.on("message",(t=>{this.lastActivityTime=Date.now(),this.handleMessage(t)})),this.ws.on("error",(t=>{e.error("Hume websocket error:",t),this.handleError(t)})),this.ws.on("close",(()=>{e.info("Hume websocket closed"),this.isConnected=!1,this.handleDisconnect()}))}catch(t){i(t)}}))}setupInactivityCheck(){setInterval((()=>{Date.now()-this.lastActivityTime>=this.inactivityTimeout&&(e.warn("WebSocket inactive, reconnecting..."),this.reconnect())}),1e4)}async reconnect(){this.reconnectAttempts<this.maxReconnectAttempts?(this.reconnectAttempts++,this.reconnectDelay*=2,e.info(`Attempting to reconnect in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})`),setTimeout((async()=>{try{await this.connect();for(const[t,e]of this.activeStreams)await this.startStream(t,e)}catch(t){e.error("Reconnection attempt failed:",t)}}),this.reconnectDelay)):e.error("Max reconnection attempts reached")}async startStream(t,s){this.isConnected||await this.connect();const a={models:s.models||{language:{},face:{},prosody:{}},raw_text:s.rawText||!0,reset_stream:s.resetStream||!1};this.activeStreams.set(t,{config:a,callbacks:new Map,buffer:[]}),await this.sendMessage({type:"stream_start",stream_id:t,config:a}),e.info(`Started stream ${t}`)}async stopStream(t){this.activeStreams.get(t)&&(await this.sendMessage({type:"stream_end",stream_id:t}),this.activeStreams.delete(t),e.info(`Stopped stream ${t}`))}async processText(t,e=null){const s=e||`text_${Date.now()}`;return e||await this.startStream(s,{models:{language:{}}}),this.sendData(s,{type:"text",data:t})}async processVoice(t,e=null){const s=e||`voice_${Date.now()}`;e||await this.startStream(s,{models:{prosody:{}}});const a=this.splitAudioIntoChunks(t),i=[];for(const t of a){const e=await this.sendData(s,{type:"prosody",data:t.toString("base64")});i.push(e)}return e||await this.stopStream(s),this.mergeResults(i)}async processFacial(t,e=null){const s=e||`face_${Date.now()}`;e||await this.startStream(s,{models:{face:{}}});const a=await this.sendData(s,{type:"face",data:t.toString("base64")});return e||await this.stopStream(s),a}splitAudioIntoChunks(t,e=5e3){const s=[];let a=0;for(;a<t.length;)s.push(t.slice(a,a+e)),a+=e;return s}mergeResults(t){const e={emotions:new Map};return t.forEach((t=>{t.emotions.forEach((t=>{const s=e.emotions.get(t.name)||{score:0,count:0};s.score+=t.score,s.count+=1,e.emotions.set(t.name,s)}))})),Array.from(e.emotions.entries()).map((([t,e])=>({name:t,score:e.score/e.count})))}async sendData(t,e){return new Promise(((s,a)=>{const i=Date.now().toString(),o=this.activeStreams.get(t);o?(o.callbacks.set(i,(t=>{t.error?a(new Error(t.error)):s(this.processEmotions(t.emotions))})),this.sendMessage({id:i,stream_id:t,...e})):a(new Error(`Stream ${t} not found`))}))}async sendMessage(t){if(!this.isConnected)throw new Error("WebSocket not connected");this.messageQueue.push(t),this.processingQueue||await this.processMessageQueue()}async processMessageQueue(){for(this.processingQueue=!0;this.messageQueue.length>0;){const t=this.messageQueue.shift();try{this.ws.send(JSON.stringify(t)),this.lastActivityTime=Date.now(),await new Promise((t=>setTimeout(t,20)))}catch(s){e.error("Failed to send message:",s),this.messageQueue.unshift(t);break}}this.processingQueue=!1}handleMessage(t){try{const e=JSON.parse(t),s=this.activeStreams.get(e.stream_id);s&&e.id&&s.callbacks.has(e.id)&&(s.callbacks.get(e.id)(e),s.callbacks.delete(e.id))}catch(t){e.error("Error handling Hume message:",t)}}processEmotions(t){return t.map((t=>({name:t.name,score:t.score,vector:a(t.name),color:s[t.name],confidence:t.confidence||t.score}))).filter((t=>t.confidence>=.1)).sort(((t,e)=>e.score-t.score))}async close(){for(const t of this.activeStreams.keys())await this.stopStream(t);this.ws&&(this.ws.close(),this.ws=null,this.isConnected=!1,e.info("Hume websocket connection closed"))}},r=new class{constructor(){this.activeStreams=new Map,this.chunkDuration=5e3,this.maxResolution={width:3e3,height:3e3},this.processingInterval=1e3}async startStream(t,s,a={}){if(this.activeStreams.has(t))return void e.warn(`Stream ${t} is already active`);const i={id:t,buffer:[],lastProcessed:Date.now(),onUpdate:s,processingInterval:null,config:{resetStream:a.resetStream||!1,models:{face:a.faceConfig||{}},...a}};try{await n.startStream(t,i.config),i.processingInterval=setInterval((()=>this.processStreamBuffer(i)),this.processingInterval),this.activeStreams.set(t,i),e.info(`Started video stream ${t}`)}catch(s){throw e.error(`Failed to start video stream ${t}:`,s),s}}async stopStream(t){const s=this.activeStreams.get(t);s?(s.processingInterval&&clearInterval(s.processingInterval),await this.processStreamBuffer(s),await n.stopStream(t),this.activeStreams.delete(t),e.info(`Stopped video stream ${t}`)):e.warn(`Stream ${t} not found`)}async addFrame(t,s,a=Date.now()){const i=this.activeStreams.get(t);if(i)try{const t=await this.getFrameDimensions(s);if(!this.validateFrameDimensions(t))return void e.warn(`Frame dimensions exceed maximum (${t.width}x${t.height})`);i.buffer.push({data:s,timestamp:a}),this.trimBuffer(i)}catch(s){e.error(`Error adding frame to stream ${t}:`,s)}else e.warn(`Stream ${t} not found, frame discarded`)}async processStreamBuffer(t){if(0!==t.buffer.length)try{const e=Date.now(),s=e-this.chunkDuration,a=t.buffer.filter((t=>t.timestamp>=s));if(0===a.length)return;const i=this.selectBestFrame(a),o=await n.processFacial(i.data,t.id);t.onUpdate&&o.length>0&&t.onUpdate({streamId:t.id,timestamp:e,emotions:o,frameCount:a.length,selectedFrameTime:i.timestamp}),t.buffer=t.buffer.filter((t=>t.timestamp>s)),t.lastProcessed=e}catch(s){e.error(`Error processing stream ${t.id}:`,s)}}selectBestFrame(t){return t[Math.floor(t.length/2)]}trimBuffer(t){const e=Date.now();t.buffer=t.buffer.filter((t=>e-t.timestamp<=this.chunkDuration))}async getFrameDimensions(t){return{width:1280,height:720}}validateFrameDimensions(t){return t.width<=this.maxResolution.width&&t.height<=this.maxResolution.height}getStreamStatus(t){const e=this.activeStreams.get(t);return e?{id:e.id,isActive:!0,bufferSize:e.buffer.length,lastProcessed:e.lastProcessed,timeSinceLastProcess:Date.now()-e.lastProcessed,config:e.config}:null}getAllStreams(){return Array.from(this.activeStreams.keys()).map((t=>this.getStreamStatus(t)))}async cleanup(){for(const t of this.activeStreams.keys())await this.stopStream(t)}};function c(){throw new Error("Redis client not initialized. Call setupRedis first.")}async function l(){}process.on("SIGTERM",(async()=>{e.info("SIGTERM received, closing Redis connection..."),await l()})),process.on("SIGINT",(async()=>{e.info("SIGINT received, closing Redis connection..."),await l()}));const m=new class{constructor(){this.redis=null,this.activeContexts=new Map,this.emotionalBuffer=new Map,this.bufferTimeout=5e3,this.customModelEnabled=!1,this.weights={evi:.5,video:.3,voice:.2}}async initialize(){this.redis=c(),await this.setupEmotionalBuffers(),await this.loadCustomModel()}async loadCustomModel(){try{if(await this.redis.exists("custom_model_config")){const t=JSON.parse(await this.redis.get("custom_model_config"));this.customModelEnabled=t.enabled,t.weights&&(this.weights=t.weights),e.info("Custom model configuration loaded")}}catch(t){e.error("Failed to load custom model:",t)}}async setupEmotionalBuffers(){try{const t="emotional_context_buffers";await this.redis.exists(t)||await this.redis.hSet(t,{active_sessions:"{}",buffer_timeouts:"{}"})}catch(t){throw e.error("Failed to setup emotional buffers:",t),t}}async startContext(t,s={}){const i={id:t,startTime:Date.now(),options:{useVideo:s.useVideo??!1,useVoice:s.useVoice??!0,useEVI:s.useEVI??!1,customModel:s.customModel??this.customModelEnabled,bufferSize:s.bufferSize??5,...s},emotionalState:{current:"neutral",confidence:1,vector:a("neutral"),history:[],sources:{}}};return this.activeContexts.set(t,i),i.options.useVideo&&await r.startStream(t,(e=>{this.handleVideoEmotion(t,e)}),{resetStream:!0,faceConfig:{minConfidence:.7,returnPoints:!0}}),i.options.useVoice&&!i.options.useEVI&&await n.startStream(t,{models:{prosody:{}},resetStream:!0}),e.info(`Started emotional context ${t} with options:`,i.options),i}async handleEVIEmotion(t,s){const a=this.activeContexts.get(t);a?(a.emotionalState.sources.evi={emotion:s.emotion,confidence:s.confidence,vector:s.vector,timestamp:Date.now()},await this.updateEmotionalState(t,{emotion:s.emotion,confidence:s.confidence,vector:s.vector,source:"evi",timestamp:Date.now()})):e.warn(`Context ${t} not found for EVI emotion`)}async handleVideoEmotion(t,s){const a=this.activeContexts.get(t);if(a){if(s.emotions.length>0){const e=s.emotions[0];a.emotionalState.sources.video={emotion:e.name,confidence:e.confidence,vector:e.vector,timestamp:s.timestamp},await this.updateEmotionalState(t,{emotion:e.name,confidence:e.confidence,vector:e.vector,source:"video",timestamp:s.timestamp})}}else e.warn(`Context ${t} not found for video emotion`)}async handleVoiceEmotion(t,s){const a=this.activeContexts.get(t);if(a)try{let e;if(a.options.useEVI)return;if(e=await n.processVoice(s,t),e.length>0){const s=e[0];a.emotionalState.sources.voice={emotion:s.name,confidence:s.confidence,vector:s.vector,timestamp:Date.now()},await this.updateEmotionalState(t,{emotion:s.name,confidence:s.confidence,vector:s.vector,source:"voice",timestamp:Date.now()})}}catch(s){e.error(`Error processing voice emotion for context ${t}:`,s)}else e.warn(`Context ${t} not found for voice emotion`)}async updateEmotionalState(t,e){const s=this.activeContexts.get(t);s&&(this.emotionalBuffer.has(t)||this.emotionalBuffer.set(t,[]),this.emotionalBuffer.get(t).push(e),this.emotionalBuffer.get(t).length>=s.options.bufferSize?await this.processEmotionalBuffer(t):setTimeout((async()=>{await this.processEmotionalBuffer(t)}),this.bufferTimeout))}async processEmotionalBuffer(t){const e=this.emotionalBuffer.get(t);if(!e||0===e.length)return;const s=this.activeContexts.get(t);if(!s)return;const a=new Array(e[0].vector.length).fill(0);let o=0;const n=this.groupBySource(e);for(const[t,e]of Object.entries(n)){const s=this.weights[t]*this.calculateSourceConfidence(e);this.combineSourceEmotions(e).forEach(((t,e)=>{a[e]+=t*s})),o+=s}o>0&&a.forEach(((t,e)=>{a[e]/=o})),s.emotionalState={current:i(a),confidence:o,vector:a,sources:s.emotionalState.sources,history:[...s.emotionalState.history,{timestamp:Date.now(),emotions:e,sources:{...s.emotionalState.sources}}].slice(-100)},await this.redis.hSet(`emotional_context:${t}`,{state:JSON.stringify(s.emotionalState),lastUpdate:Date.now().toString()}),this.emotionalBuffer.set(t,[])}groupBySource(t){return t.reduce(((t,e)=>{const s=e.source;return t[s]||(t[s]=[]),t[s].push(e),t}),{})}calculateSourceConfidence(t){return t.reduce(((t,e)=>t+e.confidence),0)/t.length}combineSourceEmotions(t){const e=new Array(t[0].vector.length).fill(0);return t.forEach((t=>{t.vector.forEach(((s,a)=>{e[a]+=s*t.confidence}))})),e}async getEmotionalContext(t){const e=this.activeContexts.get(t);if(!e){const e=await this.redis.hGetAll(`emotional_context:${t}`);return e.state?JSON.parse(e.state):null}return e.emotionalState}async stopContext(t){const s=this.activeContexts.get(t);s&&(await this.processEmotionalBuffer(t),s.options.useVideo&&await r.stopStream(t),s.options.useVoice&&!s.options.useEVI&&await n.stopStream(t),this.activeContexts.delete(t),this.emotionalBuffer.delete(t),e.info(`Stopped emotional context ${t}`))}async cleanup(){for(const t of this.activeContexts.keys())await this.stopContext(t)}},d=new class{constructor(){this.redis=null,this.db=null,this.apiKey=process.env.HUME_API_KEY,this.apiEndpoint="https://api.hume.ai/v0/custom/models",this.activeModels=new Map,this.trainingJobs=new Map}async initialize(){this.redis=c(),this.db=function(){throw new Error("Database not initialized. Call setupDatabase first.")}(),await this.loadActiveModels()}async loadActiveModels(){try{const t=await this.db.collection("custom_models").find({status:"active"}).toArray();t.forEach((t=>{this.activeModels.set(t.modelId,t)})),e.info(`Loaded ${t.length} active custom models`)}catch(t){e.error("Failed to load active models:",t)}}async createTrainingJob(t,s){try{const e=`train_${Date.now()}_${t}`,a={id:e,userId:t,status:"preparing",config:{name:s.name,description:s.description,labelSet:s.labels||[],dataConfig:{includeExpressions:!0,includeLanguage:!0,includeProsody:!0},...s},created:new Date,updated:new Date};return await this.db.collection("training_jobs").insertOne(a),this.trainingJobs.set(e,a),await this.collectTrainingData(e),e}catch(t){throw e.error("Failed to create training job:",t),t}}async collectTrainingData(t){const s=this.trainingJobs.get(t);if(!s)throw new Error(`Training job ${t} not found`);try{s.status="collecting",await this.updateJobStatus(s);const e=await this.getEmotionalHistory(s.userId),a=await this.processTrainingData(e,s.config);await this.storeTrainingData(t,a),a.length>=100?await this.startModelTraining(t):(s.status="insufficient_data",await this.updateJobStatus(s))}catch(a){e.error(`Failed to collect training data for job ${t}:`,a),s.status="failed",s.error=a.message,await this.updateJobStatus(s)}}async getEmotionalHistory(t){return await this.db.collection("emotional_history").find({userId:t,timestamp:{$gte:new Date(Date.now()-2592e6)}}).sort({timestamp:1}).toArray()}async processTrainingData(t,e){const s=[];for(const a of t){if(!a.emotionalState||!a.context)continue;const t={timestamp:a.timestamp,labels:this.generateLabels(a,e.labelSet),data:{expressions:a.emotionalState.sources.video||null,language:a.context.text||null,prosody:a.emotionalState.sources.voice||null}};this.validateTrainingEntry(t)&&s.push(t)}return s}generateLabels(t,e){const s=new Set;return e.forEach((e=>{this.matchesLabelCriteria(t,e)&&s.add(e)})),Array.from(s)}matchesLabelCriteria(t,e){return!1}validateTrainingEntry(t){return t.labels.length>0&&(t.data.expressions||t.data.language||t.data.prosody)}async storeTrainingData(t,e){await this.db.collection("training_data").insertOne({jobId:t,data:e,timestamp:new Date})}async startModelTraining(t){const s=this.trainingJobs.get(t);if(!s)throw new Error(`Training job ${t} not found`);try{s.status="training",await this.updateJobStatus(s);const e=await this.db.collection("training_data").findOne({jobId:t}),a=await fetch(this.apiEndpoint,{method:"POST",headers:{"Content-Type":"application/json","X-Hume-Api-Key":this.apiKey},body:JSON.stringify({name:s.config.name,description:s.config.description,data:e.data})});if(!a.ok)throw new Error(`Hume API error: ${a.statusText}`);const i=await a.json();s.modelId=i.model_id,s.status="training",await this.updateJobStatus(s),this.monitorTraining(t)}catch(a){e.error(`Failed to start training for job ${t}:`,a),s.status="failed",s.error=a.message,await this.updateJobStatus(s)}}async monitorTraining(t){const s=this.trainingJobs.get(t);if(s&&s.modelId)try{const e=await fetch(`${this.apiEndpoint}/${s.modelId}`,{headers:{"X-Hume-Api-Key":this.apiKey}});if(!e.ok)throw new Error(`Hume API error: ${e.statusText}`);const a=await e.json();"completed"===a.status?await this.handleTrainingComplete(s):"failed"===a.status?await this.handleTrainingFailed(s,a.error):setTimeout((()=>this.monitorTraining(t)),3e5)}catch(s){e.error(`Error monitoring training for job ${t}:`,s)}}async handleTrainingComplete(t){try{t.status="completed",await this.updateJobStatus(t);const s={modelId:t.modelId,name:t.config.name,description:t.config.description,userId:t.userId,status:"active",created:new Date,lastUsed:null};await this.db.collection("custom_models").insertOne(s),this.activeModels.set(t.modelId,s),e.info(`Training completed for job ${t.id}`)}catch(s){e.error(`Error handling training completion for job ${t.id}:`,s)}}async handleTrainingFailed(t,s){t.status="failed",t.error=s,await this.updateJobStatus(t),e.error(`Training failed for job ${t.id}:`,s)}async updateJobStatus(t){await this.db.collection("training_jobs").updateOne({id:t.id},{$set:{status:t.status,error:t.error,updated:new Date,modelId:t.modelId}})}async getJobStatus(t){const e=this.trainingJobs.get(t);return e||await this.db.collection("training_jobs").findOne({id:t})}async getActiveModels(t){return Array.from(this.activeModels.values()).filter((e=>e.userId===t))}async deleteModel(t){try{await fetch(`${this.apiEndpoint}/${t}`,{method:"DELETE",headers:{"X-Hume-Api-Key":this.apiKey}}),this.activeModels.delete(t),await this.db.collection("custom_models").updateOne({modelId:t},{$set:{status:"deleted"}}),e.info(`Deleted custom model ${t}`)}catch(s){throw e.error(`Failed to delete model ${t}:`,s),s}}},h=new class{constructor(){this.isServerEnvironment="production"===process.env.NODE_ENV,this.hasGPU="1"===process.env.ENABLE_CUDA,this.modelConfigs={local:{default:"ollama/mistral:3.2-small",management:"ollama/mistral:3.2-small",embedding:"ollama/nomic-embed-text",fallback:"ollama/tinyllama"},server:{default:"ollama/mistral:7b-instruct",management:"ollama/mixtral:8x7b-instruct",embedding:"ollama/nomic-embed-text:latest",fallback:"ollama/mistral:3.2-small"}}}getModelConfig(t="default"){const e=this.isServerEnvironment?"server":"local",s=this.modelConfigs[e];return!this.isServerEnvironment&&this.hasGPU?this.modelConfigs.server[t]:s[t]}async validateModel(t){try{const e=await fetch("http://localhost:11434/api/tags"),{models:s}=await e.json();return s.some((e=>e.name===t))}catch(t){return e.error("Error validating model:",t),!1}}async ensureModel(t="default"){const s=this.getModelConfig(t);return await this.validateModel(s)?s:(e.info(`Model ${s} not found, falling back to smaller model`),this.modelConfigs[this.isServerEnvironment?"server":"local"].fallback)}getResourceLimits(){return this.isServerEnvironment?{maxMemory:"16gb",maxThreads:8,batchSize:32}:{maxMemory:"4gb",maxThreads:4,batchSize:8}}async getOptimalConfig(){return{model:await this.ensureModel(),...this.getResourceLimits(),environment:this.isServerEnvironment?"server":"local",gpu:this.hasGPU}}};class u{constructor(t={}){this.config={humeApiKey:t.humeApiKey||process.env.HUME_API_KEY,mongoUri:t.mongoUri||process.env.MONGODB_URI,redisUrl:t.redisUrl||process.env.REDIS_URL,weaviateUrl:t.weaviateUrl||process.env.WEAVIATE_URL,...t}}async initialize(){return await m.initialize(),await n.connect(),await d.initialize(),this}async processEmotion(t,e,s=null){return m.processEmotion(t,e,s)}async startEmotionalContext(t,e={}){return m.startContext(t,e)}async stopEmotionalContext(t){return m.stopContext(t)}async startVideoStream(t,e,s={}){return r.startStream(t,e,s)}async addVideoFrame(t,e,s){return r.addFrame(t,e,s)}async stopVideoStream(t){return r.stopStream(t)}async createCustomModel(t,e){return d.createTrainingJob(t,e)}async getCustomModels(t){return d.getActiveModels(t)}getEmotionColor(t){return s[t]}emotionToVector(t){return a(t)}vectorToEmotion(t){return i(t)}async cleanup(){await m.cleanup(),await n.close(),await r.cleanup(),await d.cleanup()}}export{d as customModelService,u as default,a as emotionToVector,m as emotionalContextService,s as expressionColors,n as humeService,h as modelSelectionService,i as vectorToEmotion,r as videoStreamService};
//# sourceMappingURL=index.js.map
