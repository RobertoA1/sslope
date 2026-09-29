from pathlib import Path
import sys,json,base64,io
from PIL import Image
folder=Path(sys.argv[1])
out=[]
for item in sys.argv[2:]:
    im=Image.open(folder/item).convert('RGB');im.thumbnail((1000,1400))
    b=io.BytesIO();im.save(b,format='JPEG',quality=48)
    out.append({'file':item,'image':'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()})
print(json.dumps(out))
