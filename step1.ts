import { BlobServiceClient } from "@azure/storage-blob";
import { QueueServiceClient } from "@azure/storage-queue";
import dotenv from "dotenv";

dotenv.config();

const containerName = "input";
const connectionString = process.env.STORAGE_ACCOUNT_CONNECTION_STRING;
if (!connectionString)
    throw new Error("No connection string provided");
const queueName = "step1";

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient(containerName);

async function processQueueMessage(message: any): Promise<void> {
    const content = JSON.parse(base64Decode(message.messageText));
    if (!content.type.toLowerCase().includes("blob")) {
        console.log("Not a blob created event");
        return;
    }
    const rawBlobUrl = content.subject; // is like: "/blobServices/default/containers/input/blobs/2023/11/order-1701284315287-a.json"
    const blobUrl = rawBlobUrl.replace(/.*\/blobs\//, "");
    const blobName = blobUrl.substring(blobUrl.lastIndexOf("/") + 1);
    const fileName = blobName.substring(0, blobName.lastIndexOf("."));
    const fileExtension = blobName.substring(blobName.lastIndexOf(".") + 1);
    const suffix = fileName.charAt(fileName.length - 1);

    let alternateSuffix: string;
    if (suffix === "a") {
        alternateSuffix = "b";
    } else if (suffix === "b") {
        alternateSuffix = "a";
    } else {
        console.log("Invalid suffix");
        return;
    }

    const alternateFileName = blobUrl.replace(fileName, fileName.slice(0, -1) + alternateSuffix);
    const alternateBlobClient = containerClient.getBlobClient(alternateFileName);
    const alternateBlobExists = await alternateBlobClient.exists();

    if (alternateBlobExists) {
        console.log("Found alternate blob");
    } else {
        console.log("Did not find alternate blob");
    }
    return;
}



function base64Decode(encodedString: string): string {
    const buffer = Buffer.from(encodedString, 'base64');
    return buffer.toString('utf-8');
}

// make an async main
async function main(connectionString: string, queueName: string) {
    // get the queue client
    const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
    const queueClient = queueServiceClient.getQueueClient(queueName);
    console.log('Starting to process queue messages')
    while (true) {
        const response = await queueClient.receiveMessages({ numberOfMessages: 10 });
        if (response.receivedMessageItems.length === 0) {
            console.log('No messages left to process')
            break;
        }
        console.log(`Processing ${response.receivedMessageItems.length} messages`)
        const messages = response.receivedMessageItems;
        await Promise.all(messages.map(async (message) => {
            await processQueueMessage(message);
            await queueClient.deleteMessage(message.messageId, message.popReceipt);
        }));
        console.log(`Processed ${response.receivedMessageItems.length} messages.`)
    }
}

// call the main
main(connectionString, queueName).catch((error) => {
    console.error("Error processing queue message:", error);
});
