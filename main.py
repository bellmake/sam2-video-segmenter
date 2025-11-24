import os
import replicate
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from typing import Optional
import shutil
import uuid
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_root():
    return JSONResponse(content={"message": "Welcome to SAM 2 Video Segmenter. Go to /static/index.html to use the app."})

@app.post("/api/segment")
async def segment_video(
    video: UploadFile = File(...),
    click_coordinates: str = Form(...),
    click_frames: str = Form(default="1"),
    click_object_ids: str = Form(default="1")
):
    """
    Uploads video to Replicate (or passes it if possible) and calls SAM 2 model.
    """
    try:
        # 1. Save uploaded video temporarily
        temp_filename = f"temp_{uuid.uuid4()}.mp4"
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
        
        # 2. Upload to Replicate (Replicate Python SDK handles file paths directly usually, 
        # but for 'input' it often expects a URL or a file handle. 
        # The SDK's `run` or `stream` method can take open file handles for `input` if the model supports it,
        # but often it's safer to use `replicate.models.predictions.create` with file handle or let the SDK handle upload if supported.
        # Actually, for `replicate.stream` or `run`, passing a file handle usually works if the input type is file.
        # Let's try passing the open file handle.
        
        # However, we closed it. Let's open it again.
        
        print(f"Processing video: {temp_filename} with clicks: {click_coordinates}")

        input_data = {
            "mask_type": "highlighted",
            "video_fps": 25,
            "click_frames": click_frames,
            "output_video": True,
            "click_object_ids": click_object_ids,
            "click_coordinates": click_coordinates
        }

        # We need to pass the file. 
        # The Replicate SDK allows passing a file handle for file inputs.
        output_url = ""
        
        with open(temp_filename, "rb") as video_file:
            input_data["input_video"] = video_file
            
            # Using the model version from the user request
            model_version = "meta/sam-2-video:33432afdfc06a10da6b4018932893d39b0159f838b6d11dd1236dff85cc5ec1d"
            
            # Using stream as requested
            # Create a client with a longer timeout (e.g., 10 minutes)
            client = replicate.Client(api_token=os.environ["REPLICATE_API_TOKEN"], timeout=600)
            
            # Use predictions.create and poll instead of stream to avoid read timeouts
            prediction = client.predictions.create(
                version=model_version.split(":")[-1],
                input=input_data
            )
            
            print(f"Prediction started: {prediction.id}")
            
            prediction.wait()
            
            if prediction.status == "succeeded":
                output_url = prediction.output
                print(f"Prediction succeeded: {output_url}")
            else:
                print(f"Prediction failed: {prediction.error}")
                raise Exception(f"Prediction failed: {prediction.error}")
        
        # Cleanup
        os.remove(temp_filename)
        
        if not output_url:
             # Sometimes the stream yields the output at the end, or we might need to check the final output.
             # If stream didn't yield a URL (it might yield logs), we might need to check how the model returns data.
             # The user example shows the event being the URL.
             pass

        if output_url:
            return {"output_video": output_url}
        else:
            # Fallback or error
            return JSONResponse(status_code=500, content={"error": "No output video URL received from Replicate."})

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error: {e}", flush=True)
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
