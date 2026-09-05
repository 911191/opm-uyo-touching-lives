import { getPool } from "../../lib/db.js";
const MAX_PASSPORT_BYTES=1500000;
const ALLOWED_TYPES=new Set(["image/jpeg","image/png","image/webp"]);
function send(res,status,body){res.setHeader("Cache-Control","no-store, max-age=0");res.setHeader("Content-Type","application/json; charset=utf-8");return res.status(status).json(body)}
function text(v,max=5000){return String(v??"").trim().slice(0,max)}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
export default async function handler(req,res){
 if(req.method!=="POST")return send(res,405,{error:"Method not allowed"});
 try{
  const b=typeof req.body==="string"?JSON.parse(req.body):(req.body||{});
  const fullName=text(b.fullName,160),email=text(b.email,200),phone=text(b.phone,60),dob=text(b.dob,30),gender=text(b.gender,40),program=text(b.program,160),address=text(b.address,1500),reason=text(b.reason,3000),passportData=text(b.passportData,2200000),passportType=text(b.passportType,80);
  if(!fullName||!phone||!dob||!gender||!program||!address||!reason)return send(res,400,{error:"Please complete all required fields."});
  if(email&&!emailOk(email))return send(res,400,{error:"Please enter a valid email address."});
  if(!passportData||!ALLOWED_TYPES.has(passportType))return send(res,400,{error:"A valid passport photograph is required."});
  const raw=passportData.split(",")[1]||""; if(Math.floor(raw.length*.75)>MAX_PASSPORT_BYTES)return send(res,413,{error:"Passport photograph is too large. Please use a smaller image."});
  const pool=getPool();
  await pool.query(`ALTER TABLE training_applications ADD COLUMN IF NOT EXISTS date_of_birth text, ADD COLUMN IF NOT EXISTS gender text, ADD COLUMN IF NOT EXISTS address text, ADD COLUMN IF NOT EXISTS reason text`);
  await pool.query(`CREATE TABLE IF NOT EXISTS training_application_private (id BIGSERIAL PRIMARY KEY, application_id BIGINT NOT NULL UNIQUE REFERENCES training_applications(id) ON DELETE CASCADE, passport_data TEXT NOT NULL, passport_type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const r=await pool.query(`INSERT INTO training_applications (full_name,email,phone,preferred_skill,message,status,date_of_birth,gender,address,reason) VALUES ($1,$2,$3,$4,$5,'new',$6,$7,$8,$9) RETURNING id`,[fullName,email||null,phone,program,reason,dob,gender,address,reason]);
  await pool.query(`INSERT INTO training_application_private (application_id,passport_data,passport_type) VALUES ($1,$2,$3)`,[r.rows[0].id,passportData,passportType]);
  return send(res,201,{ok:true,message:"Training application submitted successfully.",id:r.rows[0].id});
 }catch(e){console.error("Training application submission error:",e);return send(res,500,{error:"Unable to submit the training application right now. Please try again."})}
}
