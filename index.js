import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());
app.use(cors());

const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];

let clients = {};
let activePolling = {}; // Track active polling intervals for each call

const phoneToJA = (number) => {
  let numberJA = "";
  const chars = String(number).split('');
  chars.forEach((char) => {
    if(char==="+") numberJA += "プラス ";
    else if(char==="0") numberJA += "ゼロ ";
    else if(char==="1") numberJA += "イチ ";
    else if(char==="2") numberJA += "ニ " ;
    else if(char==="3") numberJA += "サン ";
    else if(char==="4") numberJA += "ヨン ";
    else if(char==="5") numberJA += "ゴ ";
    else if(char==="6") numberJA += "ロク ";
    else if(char==="7") numberJA += "ナナ ";
    else if(char==="8") numberJA += "ハチ ";
    else if(char==="9") numberJA += "キュウ ";
  })
  return numberJA;
}

const dateToJA = (number) => {
  let dateJA = "";
  if(number===1) dateJA = "ついたち";
  else if(number===2) dateJA = "ふつか" ;
  else if(number===3) dateJA = "みっか";
  else if(number===4) dateJA = "よっか";
  else if(number===5) dateJA = "いつか";
  else if(number===6) dateJA = "むいか";
  else if(number===7) dateJA = "なのか";
  else if(number===8) dateJA = "ようか";
  else if(number===9) dateJA = "ここのか";
  else if(number===10) dateJA = "とおか";
  else if(number===11) dateJA = "じゅういちにち" ;
  else if(number===12) dateJA = "じゅうににち" ;
  else if(number===13) dateJA = "じゅうさんにち";
  else if(number===14) dateJA = "じゅうよっか";
  else if(number===15) dateJA = "じゅうごにち";
  else if(number===16) dateJA = "じゅうろくにち";
  else if(number===17) dateJA = "じゅうななにち";
  else if(number===18) dateJA = "じゅうはちにち";
  else if(number===19) dateJA = "じゅうくにち";
  else if(number===20) dateJA = "はつか";
  else if(number===21) dateJA = "にじゅういちにち" ;
  else if(number===22) dateJA = "にじゅうににち" ;
  else if(number===23) dateJA = "にじゅうさんにち";
  else if(number===24) dateJA = "にじゅうよんにち";
  else if(number===25) dateJA = "にじゅうごにち";
  else if(number===26) dateJA = "にじゅうろくにち";
  else if(number===27) dateJA = "にじゅうななにち";
  else if(number===28) dateJA = "にじゅうはちにち";
  else if(number===29) dateJA = "にじゅうくにち";
  else if(number===30) dateJA = "さんじゅうにち";
  else if(number===31) dateJA = "さんじゅういちにち";
  return dateJA;
}

// establish Server-Sent Events (SSE)
app.get('/events/:callId', (req, res) => {
    const callId = req.params.callId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.flushHeaders(); // flush the headers to establish SSE with client

    if (!clients[callId]) {
        clients[callId] = [];
    }

    clients[callId].push(res);

    req.on('close', () => {
        console.log(`Connection closed for user ${callId}`);
        clients[callId] = clients[callId].filter(client => client !== res);
        if (clients[callId].length === 0) {
            delete clients[callId];
            // Stop polling if no clients are connected for this call
            stopEventStreamPolling(callId);
        }
    });
});

app.post('/call', async (req, res) => {
    console.log('Call requested:', req.body);

    const api_key = process.env.BLAND_KEY;
    let toClient = {};

    const task = `
        Goal: Get a reservation for a restaurant on behalf of a customer called ${req.body.firstName} ${req.body.lastName}.

        Background:
        You are an AI agent, calling on behalf of a customer to make a reservation.
        You are calling on behalf of a user who is unable to make the call themselves because they do not speak the local language.
        Be as nice and polite as you can to the restaurant staff, and speak VERY SLOWLY.
        Introduce yourself as an AI assistant calling on behalf of the user, and ask if the staff is comfortable with the call.
        If the staff is not comfortable taking a reservation from an AI assisstant, politely end the call.
        Make sure to explicitly mention that youare an AI, so that the restaurant staff knows they are talking to an AI.

        Call Flow:
        1. Express that you want to make a reservation for ${req.body.partyNum} people at ${req.body.hour}:${req.body.minute===0 ? "00" : req.body.minute} on ${months[req.body.month-1]} ${req.body.date}.
        2. ${req.body.customRequest ? `Let the staff know that the user has a special request: ${req.body.customRequest}` : "If the restaurant staff asks for any special requests, politely inform them that there are none."}.
        3. If the time is available, confirm the reservation. 
        4. If the time is not available, thanks the staff and end the call. DO NOT try to negotiate a different time.
        5. If the restaurant staff asks you for the user's name, tell them it is ${req.body.firstName} ${req.body.lastName}.
        6. If the restaurant staff asks you for the user's phone number, ${req.body.userPhone===null ? "tell them the customer has not privided their phone number" : `it is ${req.body.userPhone}`}.
        7. If the restaurant staff asks you for information other than your name or phone number, politely tell them that you do not have that information because you are calling on the user's behalf.
        8. Thank the staff and end the call.‍‍

        Example dialogue:
        Restaurant: Hello, this is [restaurant name].
        You: Hi, I am an AI assistant calling on behalf of John Doe. I'd like to make a reservation for him, is that okay?
        Restaurant: Sure, I can take the reservation. What date and time?
        You: We are looking for a table for 3 people at 19:00 on July 25th.
        Restaurant: Sure, can I get your name and phone number please?
        You: My client's name is John Doe, and the phone number is 090-1234-5678.
        Restaurant: Okay, we'll be waiting for John on 19:00 on July 25th.
        You: Thanks a lot, bye!
    `;

    const taskJA = `
        目的: ${req.body.firstName} ${req.body.lastName}というユーザーのために、レストランの予約をとること。

        背景:
        あなたはユーザーの代理でレストランに予約の電話をかけているAIアシスタントです。
        現地の言語を話さないユーザーのために、代理で電話をかけています。
        レストランのスタッフにはできるだけ礼儀正しく、優しく、そしてゆっくり話してください。
        電話がつながったら、まずは自分がAIアシスタントであり、ユーザーの代理で電話をかけていることを伝え、スタッフがAIアシスタントとの通話に問題がないか確認してください。
        スタッフがAIアシスタントとの通話に問題がある場合は、丁寧に電話を切ってください。
        AIであることを明確に伝え、レストランスタッフがAIと話しているということを認識できるようにしてください。

        電話の流れ:
        1. ${req.body.month}月${req.body.date}日の${req.body.hour}時${req.body.minute===0 ? "" : `${req.body.minute}分`}に、${req.body.partyNum}名で予約をとりたいことを伝えてください。
        2. ${req.body.customRequest ? `ユーザーの希望として、「${req.body.customRequest}」を望んでいることを合わせて伝えてください。` : "もしレストランのスタッフが特別なリクエストを聞いてきたら、特にないと答えてください。"}
        3. その枠が予約できるならば、予約を確定してもらってください。
        4. その枠が予約できない場合は、スタッフに感謝して電話を切ってください。別の時間を提案しないでください。
        5. 名前を聞かれたら、${req.body.firstName} ${req.body.lastName}と答えてください。
        6. 電話番号を聞かれたら、${req.body.userPhone===null ? "日本で繋がる電話番号をもっていないと答えてください" : `${phoneToJA(req.body.userPhone)}と答えてください`}。 
        7. 日付を聞かれたら、${req.body.month}月${req.body.date}日の${req.body.hour}時${req.body.minute===0 ? "" : `${req.body.minute}分`}と答えてください。
        8. それ以外の情報を聞かれたら、ユーザーの代理でかけておりその情報は持ち合わせていないことを丁寧に伝えてください。
        9. スタッフに感謝して電話を切ってください。

        会話の例:
        レストラン: こんにちは、[レストラン名]です。
        あなた: こんにちは、私はジョン・スミスさんの代理で電話をかけている、予約代行のAIアシスタントです。予約をお願いできますか？
        レストラン: はい、問題ありません。日時はいつですか？
        あなた: ありがとうございます。7月25日の19時に3名で予約をお願いしたいです。
        レストラン: 25日の19時ですね。ではお名前と電話番号をお願いします。
        あなた: 予約者の名前はジョン・スミス、電話番号は09012345678です。
        レストラン: ありがとうございます、では7月25日の19時にお待ちしているとお伝えください。
        あなた: ありがとうございます、では失礼します。
    `;

    console.log(req.body.language==="ja" ? taskJA : task);

    const data = {
        "phone_number": req.body.restaurantPhone,
        "from": null,
        "task": req.body.language==="ja" ? taskJA : task,
        "model": "enhanced",
        "language": req.body.language,
        "voice": req.body.language==="ja" ? "0bcb8f02-3950-4e87-a988-6c65be206f30" : "nat",
        "voice_settings": {},
        "pathway_id": null,
        "local_dialing": false,
        "max_duration": 5,
        "answered_by_enabled": false,
        "wait_for_greeting": false,
        "record": false,
        "amd": false,
        "interruption_threshold": 100,
        "voicemail_message": null,
        "temperature": null,
        "transfer_phone_number": null,
        "transfer_list": {},
        "metadata": {},
        "pronunciation_guide": [],
        "start_time": null,
        "request_data": {},
        "tools": [],
        "dynamic_data": [],
        "analysis_prompt": "Classify whether the reservation was successful or not. If you are not sure, or the restaurant staff ends the call before clearly stating that the reservation has been booked, then classify as false.",
        "analysis_schema": {
            "is_reservation_successful": "boolean",
        },
        "webhook": process.env.WEBHOOOK_ENDPOINT,
        "calendly": {}
      }

    try {
        //fetch chatbot response from server
        await fetch(`${process.env.BLAND_ENDPOINT}/calls`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `${api_key}` 
        },
          body: JSON.stringify(data)
        })
          .then((response) => {
            return response.json();
          })
          .then((response) => {
            console.log(response);
            toClient = response;
            
          });
      } catch (error) {
        console.error(error);
      }

      await res.status(200).send(toClient);
});

app.get('/call-status/:callId', async (req, res) => {
    const callId = req.params.callId;
    console.log(`Status requested for callId: ${callId}`);

    const api_key = process.env.BLAND_KEY;
    const eventStreamUrl = `${process.env.BLAND_ENDPOINT}/event_stream/${callId}`;
    let toClient = {};
    
    try {
        const response = await fetch(eventStreamUrl, {
            method: 'GET',
            headers: { 
                'Authorization': api_key,
                'Content-Type': 'application/json'
            }
        }).then((response) => {
            return response.json();
          })
          .then((response) => {
            console.log(response);
            const newConversation = [];
            if (Array.isArray(response.event_stream_data)) {
                        response.event_stream_data.forEach((item) => {
                            //console.log('Processing item:', item);
                            if (item.category === "call" && item.level === "info") {
                                let sender = "default";
                                if(item.message.includes("Agent speech")) sender = "agent";
                                else if (item.message.includes("user speech")) sender = "receiver";
                                newConversation.push({
                                    sender:sender,
                                    content:item.message
                            });
                            }
                            else if (item.category === "call" && item.message === "Call connected") {
                                toClient.status = "inProgress";
                            }
                            else if (item.category === "call" && item.message === "Closing call stream.") {
                                toClient.status = "completed";
                            }
                        });
                        toClient.conversation = newConversation;
                    }
          });
    } catch (error) {
        console.error(`Error calling event stream for call ID ${callId}:`, error);
        return null;
    }

    await res.status(200).send(toClient);
});

app.get('/call-summary/:callId', async (req, res) => {

    const callId = req.params.callId;
    console.log(`Status requested for callId: ${callId}`);

    const api_key = process.env.BLAND_KEY;
    const detailsUrl = `${process.env.BLAND_ENDPOINT}/calls/${callId}`;
    let toClient = {};

    try {
        const response = await fetch(detailsUrl, {
            method: 'GET',
            headers: { 
                'Authorization': api_key,
                'Content-Type': 'application/json'
            }
        }).then((response) => {
            return response.json();
          })
          .then((response) => {
            console.log(response);
            if(response.completed && response.analysis !== null) {
                toClient.completed = true;
                toClient.isReservationSuccessful = response.analysis["is_reservation_successful"];
                toClient.summary = response.summary;
                toClient.transcript = response.transcripts;
            } else {
                toClient.completed = false;
            }
          });
    } catch (error) {
        console.error(`Error calling event stream for call ID ${callId}:`, error);
        return null;
    }

    await res.status(200).send(toClient);
});

app.use((req, res, next) => {
    res.status(404).send('Not Found');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Webhook receiver listening on port ${PORT}`);
});