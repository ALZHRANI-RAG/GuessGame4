const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const gameData = {
    "سيارات": [
        { p1Item: "مرسيدس", p1Img: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8", p2Item: "بي ام دبليو", p2Img: "https://images.unsplash.com/photo-1555215695-3004980ad54e" },
        { p1Item: "بورش", p1Img: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e", p2Item: "فراري", p2Img: "https://images.unsplash.com/photo-1583121274602-3e2820c69888" }
    ],
    "حيوانات": [
        { p1Item: "أسد", p1Img: "https://images.unsplash.com/photo-1546182990-dffeafbe841d", p2Item: "نمر", p2Img: "https://images.unsplash.com/photo-1574063413132-355dbfd83e82" }
    ]
};

let activeRooms = {};

io.on('connection', (socket) => {
    
    socket.on('hostCreateRoom', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        activeRooms[roomId] = {
            host: socket.id,
            player: null,
            round: 1,
            category: "سيارات",
            itemIndex: 0,
            hostTurn: true // الهوست يبدأ أولاً
        };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
    });

    socket.on('playerJoinRoom', (roomId) => {
        const room = activeRooms[roomId];
        if (room && !room.player) {
            room.player = socket.id;
            socket.join(roomId);
            setupRound(roomId);
        }
    });

    function setupRound(roomId) {
        const room = activeRooms[roomId];
        const currentChallenge = gameData[room.category][room.itemIndex];

        // إرسال البيانات وتحديد من الذي عليه الدور حالياً لقفل أو فتح العداد عنده
        io.to(room.host).emit('startRoundData', {
            round: room.round,
            category: room.category,
            image: currentChallenge.p1Img,
            myTurn: room.hostTurn
        });

        if (room.player) {
            io.to(room.player).emit('startRoundData', {
                round: room.round,
                category: room.category,
                image: currentChallenge.p2Img,
                myTurn: !room.hostTurn
            });
        }
    }

    socket.on('gameAction', (data) => {
        const room = activeRooms[data.room];
        if(!room) return;

        if (data.action === 'chat') {
            const currentChallenge = gameData[room.category][room.itemIndex];
            const isHost = socket.id === room.host;
            
            // التحقق هل اللاعب الذي أرسل هو صاحب الدور فعلياً؟
            if ((isHost && !room.hostTurn) || (!isHost && room.hostTurn)) {
                socket.emit('receiveMsg', { text: "⚠️ ليس دورك الآن! انتظر الخصم." });
                return;
            }

            // الكلمة المستهدفة (الهوست يخمن صورة اللاعب الثاني، واللاعب يخمن صورة الهوست)
            const targetWord = isHost ? currentChallenge.p2Item : currentChallenge.p1Item;

            if (data.text.trim() === targetWord) {
                room.itemIndex += 1;
                room.round += 1;
                
                // إذا انتهت الصور في الفئة الحالية
                if (room.itemIndex >= gameData[room.category].length) {
                    room.itemIndex = 0;
                    room.category = room.category === "سيارات" ? "حيوانات" : "سيارات";
                }

                io.to(data.room).emit('correctAnswer', { text: `🎉 صح! الإجابة هي ${targetWord}` });
                setupRound(data.room);
            } else {
                // إجابة خاطئة -> يقلب الدور فوراً للطرف الثاني
                room.hostTurn = !room.hostTurn;
                io.to(data.room).emit('turnSwitched', { text: `❌ خطأ! انقلب الدور.` });
                setupRound(data.room);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {});
