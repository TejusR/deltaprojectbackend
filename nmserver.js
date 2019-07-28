var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
const pg = require('pg');
var jwt = require('jsonwebtoken');
var multer = require('multer');
var app = express();
const http = require("http").Server(app)
var io = require('socket.io')(http);
var dir= "./uploads/";
app.use(bodyParser.urlencoded({extended : true}));
app.use(bodyParser.json());
app.use(cors({
	credentials: true,
}));
var port = process.env.port || 3000;
app.use(express.static('public'));
const config={
	user: 'tejus',
	database:'nm',
	password: 'tejus',
	port:5432,
};
var users={};
app.use('/uploads',express.static(dir));
const pool=new pg.Pool(config);
pool.on('connect',()=>{
	console.log('success');
});
var storage=multer.diskStorage({
	destination:function(req,file,cb){
		cb(null,'./uploads/');
	},
	filename:function(req,file,cb){
		console.log(file);
		pool.connect(function(err,client,done){
	    client.query('SELECT * FROM posts',function(err,result){
				cb(null,(Number(result.rows.length)).toString()+'.png');
			});
		});
	}
});
var profstorage=multer.diskStorage({
	destination:function(req,file,cb){
		cb(null,'./uploads/');
	},
	filename:function(req,file,cb){
			cb(null,file.fieldname+".png");
	}
});
var setprofilepic=multer({storage:profstorage});
var upload=multer({ storage:storage });
io.on("connection",function(socket){
  socket.on('setuser',function(data){
		users[data]=socket.id;
	});
	socket.on("chatmessage",function(data){
		pool.connect(function(err,client,done){
			client.query("insert into messages(messagefrom,messageto,content,messdate) values($1,$2,$3,$4)",[data.from,data.to,data.mes,Date.now()]);
			done();
		});
		io.to(users[data.to]).emit('updatemessage',{from:data.from,mes:data.mes});
	});
});
app.post('/createaccount',upload.none(),function(request,response){
 pool.connect(function(err,client,done){
	 client.query('SELECT * FROM users where username=$1',[request.body.user],function(err,result){
		 if(result.rows>'0')
		 {
			 response.send("Username already exists");
		 }
		 else{
			 client.query('INSERT INTO users(username,password) VALUES($1,$2)',[request.body.user,request.body.pass],function(err,results){
         client.query('CREATE TABLE '+request.body.user+'_friends(id serial PRIMARY KEY,username TEXT,status TEXT)');
				 response.send('success');
			 });
		 }
		 done();
	 });
 });
});
app.post('/auth',function(request,response){
	response.setHeader('Access-Control-Allow-Credentials', 'true');
	pool.connect(function(err,client,done){
		client.query('SELECT* FROM users WHERE username=$1 AND password=$2',[request.body.user,request.body.pass],function(err,result){
			if(result.rows>'0'){
			  jwt.sign({user:request.body.user},'hvbhbwiubui',{ expiresIn: '10h' },function(err,token){
				 response.json({
					 message:"success",
					 token
				 });
				});
		  }
			else
				response.json({
				  message:"Incorrect"
				});
			done();
		});
	});
});
app.post('/home',function(request,response){
	  jwt.verify(request.body.token,'hvbhbwiubui',function(err,decoded){
		response.send(decoded.user)
	});
});
app.post('/post',upload.single('photo'),function(request,response){
	pool.connect(function(err,client,done){
		jwt.verify(request.body.token,'hvbhbwiubui',function(err,decoded){
		 client.query('INSERT INTO posts(userid,post,postdate) VALUES($1,$2,$3)',[decoded.user,request.body.message,Date.now()],function(err,result){
			 if(err){
				 throw err;
			 }
		   else{
				 response.send("suc");
			 }
		 });
		});
	});
});
app.post('/frnds',function(request,response){
	jwt.verify(request.body.token,'hvbhbwiubui',function(err,decoded){
		pool.connect(function(err,client,done){
			client.query("SELECT * FROM friends WHERE status='active' AND (fromuser=$1 OR touser=$2)",[decoded.user,decoded.user],function(err,cf){
			  client.query("SELECT * FROM friends WHERE status='sent' AND touser=$1",[decoded.user],function(err,frreq){
					client.query("SELECT username FROM users WHERE username NOT IN(SELECT touser FROM friends WHERE fromuser=$1) AND username NOT IN(SELECT fromuser FROM friends WHERE touser=$2)",[decoded.user,decoded.user],function(err,allusers){
						response.json({
							cf:cf.rows,
							frreq:frreq.rows,
							allusers:allusers.rows,
							user:decoded.user
						});
					});
				});
				done();
			});
		});
	});
});

app.post('/sendreq',function(req,res){
	jwt.verify(req.body.token,'hvbhbwiubui',function(err,decoded){
		pool.connect(function(err,client,done){
      client.query("insert into friends(fromuser,touser,status) values($1,$2,$3)",[decoded.user,req.body.to,'sent']);
			res.send('success');
			done();
		});
	});
});
app.post('/acceptreq',function(req,res){
	jwt.verify(req.body.token,'hvbhbwiubui',function(err,decoded){
		pool.connect(function(err,client,done){
      client.query("update friends set status='active' where fromuser=$1 and touser=$2",[req.body.userid,decoded.user]);
			done();
		});
	});
});
app.post('/displayPosts',function(req,res){
	jwt.verify(req.body.token,'hvbhbwiubui',function(err,decoded){
		if(decoded==null){
			res.json({
				message:"error"
			});
		}
		else{
			pool.connect(function(err,client,done){
				client.query("select * from posts where userid in (SELECT touser FROM friends WHERE status='active' AND fromuser=$1) or userid in(select fromuser from friends where touser=$2)",[decoded.user,decoded.user],function(err,result){
					res.json({
           message:"success",
					 posts:result.rows
				 });
				});
				done();
			});
		}
	});
});
app.post('/messages',function(req,res){
	jwt.verify(req.body.token,'hvbhbwiubui',function(err,decoded){
		if(decoded==null){
			res.json({
				message:"error"
			});
		  }
			else{
				pool.connect(function(err,client,done){
          client.query("SELECT * FROM messages WHERE messagefrom=$1 order by messdate desc",[decoded.user],function(err,sent){
						client.query("SELECT * FROM messages WHERE messageto=$1 order by messdate desc",[decoded.user],function(err,recieved){
						 client.query("select * from users where username not in(SELECT messageto FROM messages WHERE messagefrom=$1) and username not in(SELECT messagefrom FROM messages WHERE messageto=$2)",[decoded.user,decoded.user],function(err,newchats){
							 res.json({
								newchats:newchats.rows,
 								message:"success",
 								sent:sent.rows,
 								recieved:recieved.rows
 							});
						 });
						});
					});
					done();
				});
			}
	});
});
app.post('/profile',function(req,res){
	jwt.verify(req.body.token,'hvbhbwiubui',function(err,decoded){
		if(decoded==null){
			res.json({
				message:"error"
			});
		 }
		 else{
			 pool.connect(function(err,client,done){
         client.query("SELECT * FROM friends WHERE status='active' AND (fromuser=$1 OR touser=$2)",[decoded.user,decoded.user],function(err,friends){
					 client.query("select * from posts where userid=$1",[decoded.user],function(err,userposts){
						 res.json({
							 message:"success",
							 user:decoded.user,
							 userposts:userposts.rows,
							 friends:friends.rows
						 });
					 });
				 });
				 done();
			 });
		 }
	});
});
app.post('/updateprofile',setprofilepic.any(),function(req,res){
   res.send('profile picture updated');
});
app.post('/dismes',function(req,res){
	console.log(req.body.touser);
	pool.connect(function(err,client,done){
		jwt.verify(req.body.token,'hvbhbwiubui',function(err,decoded){
			client.query("SELECT * FROM messages WHERE (messagefrom=$1 and messageto=$2) or (messagefrom=$3 and messageto=$4) order by messdate desc",[decoded.user,req.body.touser,req.body.touser,decoded.user],function(err,msg){
				console.log(msg.rows);
				res.json({
					messages:msg.rows
				});
			});
		});
	});
});
http.listen(port);
