//1. 모듈포함
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path =require("path");

const FabricCAServices = require("fabric-ca-client");
const { Gateway, Wallets} =require("fabric-network");


//2. connection.json 객체화
const ccpPath = path.resolve(__dirname, '..','..','..',"fabric-samples", "test-network", "organizations", "peerOrganizations", "org1.example.com", "connection-org1.json");
const ccp = JSON.parse(fs.readFileSync(ccpPath,"utf8"));


//3. 서버 설정
const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";

app.use(express.static(path.join(__dirname, "views")));
app.use(bodyParser.json());


//4. "/" GET 라우팅
app.get("/", (req, res) => {
    res.sendFile(__dirname + "index.html");
});
//5. /admin POST 라우팅 (id, password)
app.post('/admin', async(req, res) => {
    const id = req.body.id;
    const pw = req.body.password;
    console.log(id, pw);

    try{
        //Ca접속
        const caInfo= ccp.certificateAuthorities["ca.org1.example.com"];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify:false }, caInfo.caName);
        //기존 admin walltet 확인
        
        const walletPath =path.join(process.cwd(), "wallet");
        console.log(walletPath)
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        const identity= await wallet.get(id);
        if (identity){
            console.log(`An identify for the admin user ${id} already exists in the wallet`);
            const res_str = `{"result": "failed", "msg":"An identity for the admin user  ${id} already exists in the wallet"}`;
            res.json(JSON.parse(res_str));
            return;
        }
        //admin 등록
        const enrollment = await ca.enroll({ enrollmentID: id, enrollmentSecret: pw });
        //인증서 발급
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId:"Org1MSP",
            type: "X.509",
        };
        await wallet.put(id, x509Identity);
        // 응답 to client 
        console.log('Successfully enrolled admin user "admin" and imported it into the wallet');
        const res_str= `{"result": "success", "msg":"SUccessfully enrolled admin user admin  ${id} in the wallet"}`;
        res.status(200).json(JSON.parse(res_str));

    } catch(error) {
        console.log(`Failed to enroll admin user ${id} :  ${error}`);
        const res_str = `{"result": "failed", "msg":"failed to enroll admin user ${id} : ${error}"}`;
        res.json(JSON.parse(res_str));
    }
});

//6. /user POST 라우팅 (id, userrole)
app.post("/user", async (req, res) => {
    const id = req.body.id;
    const userrole = req.body.userrole;

    console.log(id, userrole);

    try{
        //create a new CA client for interacting with the ca.
        const caInfo = ccp.certificateAuthorities["ca.org1.example.com"];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false}, caInfo.caName);

        //create a new file system based wallet for managing identities.
        const walletPath = path.join(process.cwd(), "wallet");
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path : ${ walletPath}`);

        //check to see if we've alreay enrolled the user.
        const userIdentity = await wallet.get(id);
        if (userIdentity) {
            console.log('An identity for the user "appUser" already exists in the wallet');
            const res_str = `{"result":"failed", "msg":"An identity for the user ${id} already exists in the wallet"}`;
            res.json(JSON.parse(res_str));
            return;
        }
        const adminIdentity = await wallet.get("admin");
        if (!adminIdentity) {
            console.log('An identity for the admin user "admin" does not exist in the wallet');
            const res_str = `{"result":"failed", "msg": "An identity for the admin user ${id} does not exists in the wallet"}`;
            res.json(JSON.parse(res_str));
            return;
        }
        //build a user object for authenticating with the ca
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, "admin");

        //Register the user, enroll the user, and import the new identity into the wallet.
        const secret = await ca.register(
            {
                affiliation: "org1.department1",
                enrollmentID: id,
                role: userrole,
            },
            adminUser
        );
        const enrollment = await ca.enroll({
            enrollmentID : id,
            enrollmentSecret: secret,
        });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: "Org1MSP",
            type:"X.509",
        };
        await wallet.put(id, x509Identity);

        //response to client
        console.log('Successfully registered and enrolled admin user "appUser" and imported it into the wallet');
        const res_str = `{"result":"success", "msg":"Successfully enrolled user ${id} in the wallet"}`;
        res.status(200).json(JSON.parse(res_str));
        } catch (error) {
            console.error(`Failed to enroll admin user ${id}`);
            const res_str = `{"result":"failed", "msg":"failed to register user - ${id} : ${error}"}`;
            res.json(JSON.parse(res_str));
        }
    
});

//7. server 시작
app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);