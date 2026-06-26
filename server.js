const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// بنك البيانات: الفئات والصور والكلمات الصحيحة لكل لاعب
const gameData = {
    "حيوانات": [
        { p1Item: "أسد", p1Img: "https://images.unsplash.com/photo-1546182990-dffeafbe841d", p2Item: "نمر", p2Img: "https://images.unsplash.com/photo-1574063413132-355dbfd83e82" },
        { p1Item: "فيل", p1Img: "https://images.unsplash.com/photo-1557050543-4d5f4e07ef46", p2Item: "زرافة", p2Img: "https://images.unsplash.com/photo-1547407139-3c921a66005c" }
    ],
    "سيارات": [
        { p1Item: "بي ام دبليو", p1Img: "https://images.unsplash.com/photo-1555215695-3004980ad54e", p2Item: "مرسيدس", p2Img: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8" },
        { p1Item: "بورش", p1Img: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e", p2Item: "فراري", p2Img: "https://images.unsplash.com/photo-1583121274602-3e2820c69888" }
    ],
    "دول": [
        { p1Item: "السعودية", p1Img: "https://images.unsplash.com/photo-1589816346900-5847fa27f4da", p2Item: "مصر", p2Img: "https://images.unsplash.com/photo-1539650116574-8efeb43e2750" }
    ]
};

let activeRooms = {};

io.on('connection', (socket) => {
    
    socket.on('hostCreateRoom', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        // اختيار فئة عشوائية عند بدء الغرفة
        const categories = Object.keys(gameData);
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];

        activeRooms[roomId] = {
            host: socket.id,
            player: null,
            round: 1,
            category: randomCategory,
            itemIndex: 0, // لتبديل الصور في الجولات القادمة
            hostTurn: true
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
        } else {
            socket.emit('receiveMsg', { text: "الغرفة غير موجودة أو ممتلئة!" });
        }
    });

    function setupRound(roomId) {
        const room = activeRooms[roomId];
        const categoryItems = gameData[room.category];
        
        // التأكد من وجود جولات متبقية في الفئة، وإلا نختار فئة جديدة
        if (room.itemIndex >= categoryItems.length) {
            room.itemIndex = 0;
            const categories = Object.keys(gameData);
            room.category = categories[Math.floor(Math.random() * categories.length)];
        }

        const currentChallenge = gameData[room.category][room.itemIndex];

        // إرسال البيانات المخصصة: الهوست يرى صورة p1 واللاعب يرى صورة p2
        io.to(room.host).emit('startRoundData', {
            round: room.round,
            category: room.category,
            image: currentChallenge.p1Img,
            hostTurn: room.hostTurn
        });

        if (room.player) {
            io.to(room.player).emit('startRoundData', {
                round: room.round,
                category: room.category,
                image: currentChallenge.p2Img,
                hostTurn: room.hostTurn
            });
        }
    }

    socket.on('gameAction', (data) => {
        const room = activeRooms[data.room];
        if(!room) return;

        if (data.action === 'chat') {
            const currentChallenge = gameData[room.category][room.itemIndex];
            // تحديد الكلمة المستهدفة بناءً على دور اللاعب الحالي
            const correctWord = socket.id === room.host ? currentChallenge.p1Item : currentChallenge.p2Item;

            if (data.text.trim() === correctWord) {
                // إذا كانت الإجابة صحيحة، ننتقل للجولة التالية فورا ونغير الصور
                room.round += 1;
                room.itemIndex += 1;
                io.to(data.room).emit('receiveMsg', { text: `🎉 إجابة صحيحة! الكلمة كانت: ${correctWord}. الانتقال للجولة التالية...` });
                setupRound(data.room);
            } else {
                // إذا كانت مجرد دردشة أو تخمين خاطئ، يمرر الدور
                socket.to(data.room).emit('receiveMsg', { text: data.text });
                room.hostTurn = !room.hostTurn;
                io.to(data.room).emit('turnSwitched', { hostTurn: room.hostTurn });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بنجاح على المنفذ ${PORT}`);
});