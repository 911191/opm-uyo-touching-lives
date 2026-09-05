import { getPool } from "../../lib/db.js";
function send(res,status,body){res.setHeader("Cache-Control","no-store, max-age=0");res.setHeader("Content-Type","application/json; charset=utf-8");return res.status(status).json(body)}
function text(v,max=5000){return String(v??"").trim().slice(0,max)}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
export default async function handler(req,res){
 if(req.method!=="POST")return send(res,405,{error:"Method not allowed"});
 try{
  const b=typeof req.body==="string"?JSON.parse(req.body):(req.body||{});
  const organizationName=text(b.organizationName,200),contactName=text(b.contactName,160),email=text(b.email,200),phone=text(b.phone,60),partnershipType=text(b.partnershipType,120),message=text(b.message,5000);
  if(!organizationName||!contactName||!email||!phone||!partnershipType||!message)return send(res,400,{error:"Please complete all required fields."});
  if(!emailOk(email))return send(res,400,{error:"Please enter a valid email address."});
  const pool=getPool(); await pool.query(`ALTER TABLE partnership_applications ADD COLUMN IF NOT EXISTS partnership_type text`);
  const r=await pool.query(`INSERT INTO partnership_applications (organization_name,contact_name,email,phone,message,status,partnership_type) VALUES ($1,$2,$3,$4,$5,'new',$6) RETURNING id`,[organizationName,contactName,email,phone,message,partnershipType]);
  return send(res,201,{ok:true,message:"Partnership / CSR application submitted successfully.",id:r.rows[0].id});
 }catch(e){console.error("Partnership submission error:",e);return send(res,500,{error:"Unable to submit the partnership application right now. Please try again."})}
}
