"""macOS/Linux PTY smoke check for hidden admin-password input in an isolated D1.
Run: python tests/editor-admin-cli.py (requires installed Node dependencies).
"""
from pathlib import Path
import os, pty, secrets, select, subprocess, tempfile, time
root=Path(__file__).resolve().parent.parent
os.chdir(root)
state=Path(tempfile.mkdtemp(prefix='admin-cli-qa-',dir=root/'.sites-runtime'))
seed=root/'.sites-runtime/admin-cli-seed.mjs'
seed.write_text('''import {readFile,readdir} from "node:fs/promises";
import {openAdminDatabase} from "../scripts/editor-admin.mjs";
const c=await openAdminDatabase({local:true,"persist-to":process.argv[2]});
try{for(const name of (await readdir("drizzle")).filter(x=>x.endsWith(".sql")).sort()){
for(const sql of (await readFile("drizzle/"+name,"utf8")).split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean))await c.database.prepare(sql).run();
}}finally{await c.close()}
''')
subprocess.run(['node','--experimental-strip-types',str(seed),str(state)],check=True,timeout=30)
for action,expected in [('init',0),('init',1),('reset',0)]:
    secret=secrets.token_urlsafe(24)
    master,slave=pty.openpty()
    child=subprocess.Popen(['node','--experimental-strip-types','scripts/editor-admin.mjs',action,'--email','cli-qa@example.invalid','--local','--persist-to',str(state)],stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
    os.close(slave)
    captured=b''; entered=0; deadline=time.monotonic()+30
    try:
        while time.monotonic()<deadline:
            if select.select([master],[],[],.2)[0]:
                try: chunk=os.read(master,4096)
                except OSError: break
                if not chunk: break
                captured+=chunk
                text=captured.decode(errors='replace')
                if entered==0 and '不显示输入）：' in text:
                    os.write(master,(secret+'\n').encode()); entered=1
                if entered==1 and '再次输入新密码：' in text:
                    os.write(master,(secret+'\n').encode()); entered=2
            if child.poll() is not None: break
        if child.poll() is None:
            try: child.wait(timeout=2)
            except subprocess.TimeoutExpired: child.kill(); raise RuntimeError('CLI did not finish')
        assert child.returncode==expected,(action,child.returncode,captured.decode(errors='replace').replace(secret,'[redacted]'))
        assert entered==2
        assert secret.encode() not in captured
        assert b'pbkdf2' not in captured
        print(action+': expected result, hidden password input verified')
    finally:
        os.close(master)
        if child.poll() is None: child.kill()
