sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapGatepassCreation", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("ScrapGatepassCreation").attachMatched(this._onRouteMatched, this);
			oRouter.getRoute("ScrapGatepassCreationWithReq").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			var oArgs = oEvent.getParameter("arguments");
			var sReqNo = oArgs && oArgs.reqNo ? decodeURIComponent(oArgs.reqNo) : "";
			this._initModel(sReqNo);
		},

		_initModel: function (sReqNo) {
			var oDate = new Date();
			var that = this;
			
			var oInitialData = {
				requestDate: oDate,
				vendor: "",
				vendorAddress: "",
				vendorGST: "",
				remarks: "",
				vehicleNo: "",
				weighmentSlipNo: "",
				challanDateTime: "",
				deliveryNo: "",
				requestId: sReqNo || "",
				isFromRequest: !!sReqNo,
				saleOrder: "",
				items: [
					{
						sno: "1",
						type: "",
						description: "",
						availQty: "0",
						sendoutQty: "",
						uom: "KG"
					}
				]
			};

			if (!sReqNo) {
				var oModel = new JSONModel(oInitialData);
				this.getView().setModel(oModel, "scrapGp");
				return;
			}

			// We need to fetch details for sReqNo
			var oODataModel = this.getOwnerComponent().getModel();
			var aMockRequests = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
			var oLocalReq = aMockRequests.find(function (req) {
				return req.requestId === sReqNo;
			});

			var fnFallback = function () {
				if (oLocalReq) {
					if (oLocalReq.status === "Gate Pass Generated") {
						MessageBox.error("Already gate pass created for this request number", {
							onClose: function () {
								that.onNavBack();
							}
						});
						return;
					}
					oInitialData.remarks = oLocalReq.remarks || "";
					oInitialData.vehicleNo = oLocalReq.vehicleDetails || "";
					oInitialData.weighmentSlipNo = oLocalReq.weighmentSlipNo || "";
					oInitialData.challanDateTime = oLocalReq.challanDateTime || "";
					oInitialData.deliveryNo = oLocalReq.deliveryNo || "";
					oInitialData.saleOrder = oLocalReq.saleOrder || "";
					oInitialData.vendor = oLocalReq.vendor || "";
					oInitialData.vendorName = oLocalReq.vendorName || "";
					oInitialData.vendorAddress = oLocalReq.vendorAddress || "";
					oInitialData.vendorGST = oLocalReq.vendorGST || "";
					oInitialData.city = oLocalReq.city || "";
					oInitialData.postalCode = oLocalReq.postalCode || "";
					if (oLocalReq.items && oLocalReq.items.length > 0) {
						oInitialData.items = oLocalReq.items.map(function (item, idx) {
							var sQty = (item.quantity || "0").toString();
							return {
								sno: String(idx + 1),
								type: item.type || "",
								description: item.description || "",
								availQty: sQty,
								sendoutQty: sQty,
								uom: item.uom || "KG"
							};
						});
					}
				}
				var oModel = new JSONModel(oInitialData);
				that.getView().setModel(oModel, "scrapGp");
			};

			if (!oODataModel) {
				fnFallback();
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ScrapReqHdrSet", {
				filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo)],
				urlParameters: { "$expand": "ScrapReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oItem = oData.results && oData.results[0];
					if (!oItem) {
						fnFallback();
						return;
					}

					var sStatus = "Pending";
					if (oItem.ApprovalReq === "A") {
						sStatus = "Approved";
					} else if (oItem.ApprovalReq === "P") {
						sStatus = "Pending";
					} else if (oItem.ApprovalReq === "R") {
						sStatus = "Rejected";
					} else if (oItem.Status || oItem.ReqStatus) {
						sStatus = oItem.Status || oItem.ReqStatus;
					}
					if (oLocalReq && oLocalReq.status) {
						sStatus = oLocalReq.status;
					}

					if (sStatus === "Gate Pass Generated") {
						MessageBox.error("Already gate pass created for this request number", {
							onClose: function () {
								that.onNavBack();
							}
						});
						return;
					}

					var sChallanRaw = oItem.ChallanDate || oItem.ChallanDateTime || oItem.DCDate || "";
					var sChallanFormatted = sChallanRaw ? that._formatDate(sChallanRaw) : "";

					oInitialData.remarks = (oLocalReq && oLocalReq.remarks) ? oLocalReq.remarks : (oItem.Remarks || "");
					oInitialData.vehicleNo = (oLocalReq && oLocalReq.vehicleDetails) ? oLocalReq.vehicleDetails : (oItem.VehicleNo || oItem.VehicleDetails || "");
					oInitialData.weighmentSlipNo = (oLocalReq && oLocalReq.weighmentSlipNo) ? oLocalReq.weighmentSlipNo : (oItem.WeighmentTicket || oItem.WeighmentSlipNo || oItem.WBTicketNo || "");
					oInitialData.challanDateTime = (oLocalReq && oLocalReq.challanDateTime) ? oLocalReq.challanDateTime : sChallanFormatted;
					oInitialData.deliveryNo = (oLocalReq && oLocalReq.deliveryNo) ? oLocalReq.deliveryNo : (oItem.DCNumber || "");
					oInitialData.saleOrder = (oLocalReq && oLocalReq.saleOrder) ? oLocalReq.saleOrder : (oItem.SaleOrder || oItem.SaleOrderNo || oItem.SalesDocument || "");
					
					oInitialData.vendor = oItem.SoldToParty || "";
					oInitialData.vendorName = oItem.CustomerName || "";
					oInitialData.vendorAddress = oItem.CustomerAddress || ((oItem.City || "") + (oItem.City && oItem.PostalCode ? ", " : "") + (oItem.PostalCode || ""));
					oInitialData.vendorGST = oItem.CustomerGst || "";
					oInitialData.city = oItem.City || "";
					oInitialData.postalCode = oItem.PostalCode || "";

					if (oItem.ScrapReqItmNav && oItem.ScrapReqItmNav.results && oItem.ScrapReqItmNav.results.length > 0) {
						oInitialData.items = oItem.ScrapReqItmNav.results.map(function (subItem, idx) {
							var sRawUom = (subItem.UOM || subItem.Uom || "").toUpperCase();
							var sUom = "KG";
							if (sRawUom.indexOf("KG") !== -1 || sRawUom.indexOf("KILOGRAM") !== -1) {
								sUom = "KG";
							} else if (sRawUom.indexOf("LITRE") !== -1 || sRawUom.indexOf("LTR") !== -1 || sRawUom === "L" || sRawUom === "LIT") {
								sUom = "L";
							} else if (sRawUom.indexOf("TON") !== -1 || sRawUom.indexOf("TO") !== -1 || sRawUom.indexOf("MT") !== -1) {
								sUom = "MT";
							}
							var sQty = (subItem.OrderQuantity || subItem.Quantity || subItem.Qty || "0").toString();
							return {
								sno: String(idx + 1),
								type: that._mapMaterialType(subItem.Material || subItem.MaterialType || subItem.Type || "", subItem.MaterialDesc || subItem.Description || ""),
								description: subItem.MaterialDesc || subItem.Description || "",
								availQty: sQty,
								sendoutQty: sQty,
								uom: sUom
							};
						});
					} else if (oLocalReq && oLocalReq.items) {
						oInitialData.items = oLocalReq.items.map(function (item, idx) {
							var sQty = (item.quantity || "0").toString();
							return {
								sno: String(idx + 1),
								type: item.type || "",
								description: item.description || "",
								availQty: sQty,
								sendoutQty: sQty,
								uom: item.uom || "KG"
							};
						});
					}

					var oModel = new JSONModel(oInitialData);
					that.getView().setModel(oModel, "scrapGp");
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					fnFallback();
				}
			});
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onVendorSelect: function (oEvent) {
			var oModel = this.getView().getModel("scrapGp");
			var sKey = oEvent.getParameter("selectedItem").getKey();
			
			if (sKey === "V1") {
				oModel.setProperty("/vendorAddress", "Sri Manikandan Traders, No.102, Vridhachalam Main Road,, Neyveli, India, 607802");
				oModel.setProperty("/vendorGST", "33ABEFS1534J1ZB");
			} else if (sKey === "V2") {
				oModel.setProperty("/vendorAddress", "Metal Scrap Buyers Pvt Ltd, Chennai");
				oModel.setProperty("/vendorGST", "33XXXXXXXXXXXXX");
			}
		},

		onMaterialTypeSelect: function (oEvent) {
			var oSelect = oEvent.getSource();
			var sType = oSelect.getSelectedKey();
			var oContext = oSelect.getBindingContext("scrapGp");
			var sPath = oContext.getPath();
			var oModel = this.getView().getModel("scrapGp");

			var oInventory = JSON.parse(localStorage.getItem("mockScrapInventory") || "{}");
			
			if (sType && oInventory[sType]) {
				oModel.setProperty(sPath + "/availQty", oInventory[sType].quantity.toString());
				oModel.setProperty(sPath + "/uom", oInventory[sType].uom);
			} else {
				oModel.setProperty(sPath + "/availQty", "0");
				oModel.setProperty(sPath + "/uom", "KG");
			}
		},

		onAddItem: function () {
			var oModel = this.getView().getModel("scrapGp");
			var aItems = oModel.getProperty("/items");
			aItems.push({
				sno: String(aItems.length + 1),
				type: "",
				description: "",
				availQty: "0",
				sendoutQty: "",
				uom: ""
			});
			oModel.setProperty("/items", aItems);
		},

		onRemoveItem: function (oEvent) {
			var oModel = this.getView().getModel("scrapGp");
			var aItems = oModel.getProperty("/items");
			if (aItems.length <= 1) { return; }
			
			var oContext = oEvent.getSource().getBindingContext("scrapGp");
			var iIndex = parseInt(oContext.getPath().split("/").pop(), 10);
			aItems.splice(iIndex, 1);
			
			aItems.forEach(function(oItem, idx) { oItem.sno = String(idx + 1); });
			oModel.setProperty("/items", aItems);
		},

		onSubmit: function () {
			var oModel = this.getView().getModel("scrapGp");
			var oData = oModel.getData();
			
			// Check duplicate status
			if (oData.requestId) {
				var aMockRequests = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
				var oReq = aMockRequests.find(function (req) {
					return req.requestId === oData.requestId;
				});
				if (oReq && oReq.status === "Gate Pass Generated") {
					MessageBox.error("Already gate pass created for this request number", {
						onClose: function () {
							this.onNavBack();
						}.bind(this)
					});
					return;
				}
			}

			// Validate Quantities
			var bValid = true;
			var oInventory = JSON.parse(localStorage.getItem("mockScrapInventory") || "{}");
			
			oData.items.forEach(function(item) {
				var sendQty = parseFloat(item.sendoutQty) || 0;
				var availQty = parseFloat(item.availQty) || 0;
				if (!item.type) { bValid = false; MessageBox.error("Please select a Material Type."); }
				else if (sendQty <= 0) { bValid = false; MessageBox.error("Sendout Qty must be greater than 0."); }
				else if (sendQty > availQty) { bValid = false; MessageBox.error("Sendout Qty cannot exceed Avail Qty for " + item.type); }
			});
			
			if (!bValid) return;

			// Retrieve the vendor selection synchronously before navigation
			var oSelectedVendor = this.byId("vendorComboBox").getSelectedItem();
			var sVendorText = oSelectedVendor ? oSelectedVendor.getText() : (oData.vendorName || oData.vendor || "");

			var fnFormatDate = function (d) {
				if (!d) return "";
				if (typeof d === "string") return d;
				var y = d.getFullYear();
				var m = String(d.getMonth() + 1).padStart(2, '0');
				var day = String(d.getDate()).padStart(2, '0');
				return y + m + day;
			};

			var fnFormatToYYYYMMDD = function (val) {
				if (!val) return "00000000";
				if (val instanceof Date) {
					var y = val.getFullYear();
					var m = String(val.getMonth() + 1).padStart(2, '0');
					var day = String(val.getDate()).padStart(2, '0');
					return y + m + day;
				}
				if (typeof val === "string") {
					if (/^\d{8}$/.test(val)) return val;
					var parts = val.split("/");
					if (parts.length === 3) {
						var dd = parts[0].padStart(2, '0');
						var mm = parts[1].padStart(2, '0');
						var yyyy = parts[2];
						if (yyyy.length === 4) return yyyy + mm + dd;
					}
					var d = new Date(val);
					if (!isNaN(d.getTime())) {
						var y = d.getFullYear();
						var m = String(d.getMonth() + 1).padStart(2, '0');
						var day = String(d.getDate()).padStart(2, '0');
						return y + m + day;
					}
				}
				return "00000000";
			};

			var oPayload = {
				SalesDocument: oData.saleOrder || "",
				RequestDate: fnFormatDate(oData.requestDate),
				GatePassType: "NRGP",
				GatePassReqNo: oData.requestId || "",
				SoldToParty: oData.vendor || "",
				CustomerName: sVendorText,
				City: oData.city || "",
				PostalCode: oData.postalCode || "",
				CustomerGst: oData.vendorGST || "",
				VehicleNo: oData.vehicleNo || "",
				GatePassNo: "",
				Message: "",
				Remarks: oData.remarks || "",
				WBTicketNo: oData.weighmentSlipNo || "",
				DCNumber: oData.deliveryNo || "",
				DCDate: fnFormatToYYYYMMDD(oData.challanDateTime),
				ScrapPassItmNav: (oData.items || []).map(function (item, index) {
					var fAvail = parseFloat(String(item.availQty).replace(/,/g, '')) || 0;
					var fSendout = parseFloat(String(item.sendoutQty).replace(/,/g, '')) || 0;
					return {
						GatePassReqNo: oData.requestId || "",
						SalesDocument: oData.saleOrder || "",
						GatePassNo: "",
						ItemNo: String((index + 1) * 10).padStart(6, '0'),
						Material: item.type || "",
						MaterialDesc: item.description || "",
						OrderQuantity: fAvail.toFixed(3),
						SendoutQuantity: fSendout.toFixed(3),
						UOM: item.uom || "KG"
					};
				})
			};

			var oODataModel = this.getOwnerComponent().getModel();

			var fnMockFallback = function () {
				// Deduct Inventory
				oData.items.forEach(function(item) {
					var sendQty = parseFloat(item.sendoutQty);
					if (oInventory[item.type]) {
						oInventory[item.type].quantity -= sendQty;
					}
				});
				localStorage.setItem("mockScrapInventory", JSON.stringify(oInventory));

				if (oData.requestId) {
					var aMockRequests = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
					var oReq = aMockRequests.find(function (req) {
						return req.requestId === oData.requestId;
					});
					if (oReq) {
						oReq.status = "Gate Pass Generated";
						oReq.weighmentSlipNo = oData.weighmentSlipNo || "";
						oReq.challanDateTime = oData.challanDateTime || "";
						oReq.deliveryNo = oData.deliveryNo || "";
					} else {
						oReq = {
							requestId: oData.requestId,
							status: "Gate Pass Generated",
							weighmentSlipNo: oData.weighmentSlipNo || "",
							challanDateTime: oData.challanDateTime || "",
							deliveryNo: oData.deliveryNo || "",
							vehicleDetails: oData.vehicleNo || "",
							remarks: oData.remarks || "",
							items: oData.items.map(function(item) {
								return {
									sno: item.sno,
									type: item.type,
									description: item.description,
									quantity: item.availQty,
									uom: item.uom
								};
							})
						};
						aMockRequests.push(oReq);
					}
					localStorage.setItem("mockScrapRequests", JSON.stringify(aMockRequests));
				}
				
				var sSGPNo = "SGP2024-25-" + Math.floor(Math.random() * 9000 + 1000);
				oData.sgpNo = sSGPNo;

				// Save deliveryNo to mockScrapGpDetails
				var oGpDetails = JSON.parse(localStorage.getItem("mockScrapGpDetails") || "{}");
				oGpDetails[sSGPNo] = {
					deliveryNo: oData.deliveryNo || ""
				};
				localStorage.setItem("mockScrapGpDetails", JSON.stringify(oGpDetails));
				
				MessageBox.success("Gate Pass " + sSGPNo + " generated successfully.", {
					onClose: function () {
						this.onNavBack();
					}.bind(this)
				});
			}.bind(this);

			if (oODataModel) {
				sap.ui.core.BusyIndicator.show(0);
				oODataModel.create("/ScrapPassHdrSet", oPayload, {
					success: function (oResponse) {
						sap.ui.core.BusyIndicator.hide();
						
						var sGPNo = oResponse.GatePassNo || "";
						var sMsg = oResponse.Message || "Gate Pass created successfully.";
						var sDisplayMsg = sMsg;
						if (sGPNo && sMsg.indexOf(sGPNo) === -1) {
							sDisplayMsg += "\nGate Pass Number: " + sGPNo;
						}

						// Deduct Inventory locally just in case
						oData.items.forEach(function(item) {
							var sendQty = parseFloat(item.sendoutQty);
							if (oInventory[item.type]) {
								oInventory[item.type].quantity -= sendQty;
							}
						});
						localStorage.setItem("mockScrapInventory", JSON.stringify(oInventory));

						if (oData.requestId) {
							var aMockRequests = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
							var oReq = aMockRequests.find(function (req) {
								return req.requestId === oData.requestId;
							});
							if (oReq) {
								oReq.status = "Gate Pass Generated";
								oReq.weighmentSlipNo = oData.weighmentSlipNo || "";
								oReq.challanDateTime = oData.challanDateTime || "";
								oReq.deliveryNo = oData.deliveryNo || "";
							}
							localStorage.setItem("mockScrapRequests", JSON.stringify(aMockRequests));
						}

						if (sGPNo) {
							// Save deliveryNo to mockScrapGpDetails
							var oGpDetails = JSON.parse(localStorage.getItem("mockScrapGpDetails") || "{}");
							oGpDetails[sGPNo] = {
								deliveryNo: oData.deliveryNo || ""
							};
							localStorage.setItem("mockScrapGpDetails", JSON.stringify(oGpDetails));
						}

						oData.sgpNo = sGPNo;

						MessageBox.success(sDisplayMsg, {
							onClose: function () {
								this.onNavBack();
							}.bind(this)
						});
					}.bind(this),
					error: function (oError) {
						sap.ui.core.BusyIndicator.hide();
						var sErrMsg = "Failed to create Gate Pass.";
						try {
							var oErrBody = JSON.parse(oError.responseText);
							sErrMsg = (oErrBody.error && oErrBody.error.message && oErrBody.error.message.value) ? oErrBody.error.message.value : sErrMsg;
						} catch (e) {}
						MessageBox.error(sErrMsg);
					}
				});
			} else {
				sap.ui.core.BusyIndicator.show(0);
				setTimeout(function() {
					sap.ui.core.BusyIndicator.hide();
					fnMockFallback();
				}.bind(this), 1000);
			}
		},

		_generatePDF: async function (oData, vendorText) {
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('l', 'mm', 'a4');
			var pageWidth = doc.internal.pageSize.width;
			var margin = 14;

			// Header Logo
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, 'PNG', margin, 10, 30, 11);
			} catch (e) {
				doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(180, 0, 0);
				doc.text("MEIL", margin, 18); doc.setTextColor(0, 0, 0);
			}

			// Header Text
			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "normal"); doc.setFontSize(16);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 14, { align: "center" });
			doc.setFontSize(8);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 19, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu -607804, India.", pageWidth / 2, 23, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV | CIN : U40109TN1993PTCO26223", pageWidth / 2, 27, { align: "center" });

			// Title
			doc.setFontSize(11);
			doc.text("GATEPASS FOR SCRAP - NON-RETURNABLE MATERIAL", pageWidth / 2, 35, { align: "center" });
			var titleW = doc.getTextWidth("GATEPASS FOR SCRAP - NON-RETURNABLE MATERIAL");
			doc.setLineWidth(0.4);
			doc.line(pageWidth / 2 - titleW / 2, 36, pageWidth / 2 + titleW / 2, 36);

			// Info Details
			var y = 45;
			doc.setFontSize(10);
			doc.setFont("helvetica", "normal");
			doc.text("SGP No:", margin, y);
			doc.setFont("helvetica", "bold");
			doc.text(oData.sgpNo || "", margin + 20, y);
			
			doc.setFont("helvetica", "normal");
			doc.text("SGP Date:", pageWidth - 70, y);
			
			// Format request date robustly
			var sReqDateStr = "";
			if (oData.requestDate) {
				var vDate = oData.requestDate;
				if (vDate instanceof Date) {
					var dd = String(vDate.getDate()).padStart(2, '0');
					var mm = String(vDate.getMonth() + 1).padStart(2, '0');
					var yyyy = vDate.getFullYear();
					sReqDateStr = dd + "/" + mm + "/" + yyyy;
				} else if (typeof vDate === "string") {
					if (vDate.indexOf("Date") !== -1) {
						var timestamp = parseInt(vDate.replace(/\/Date\((\d+)\)\//, "$1"), 10);
						if (!isNaN(timestamp)) {
							var oTempDate = new Date(timestamp);
							var dd = String(oTempDate.getDate()).padStart(2, '0');
							var mm = String(oTempDate.getMonth() + 1).padStart(2, '0');
							var yyyy = oTempDate.getFullYear();
							sReqDateStr = dd + "/" + mm + "/" + yyyy;
						}
					} else {
						sReqDateStr = vDate;
					}
				}
			}
			doc.text(sReqDateStr, pageWidth - 45, y);

			y += 8;
			doc.text("Vendor:", margin, y);
			doc.setFont("helvetica", "bold");
			var vendorTextVal = vendorText || "";
			var vendorAddress = oData.vendorAddress || "";
			var fullVendor = vendorTextVal + (vendorAddress ? ", " + vendorAddress : "");
			var splitVendor = doc.splitTextToSize(fullVendor, 140);
			doc.text(splitVendor, margin + 20, y);

			doc.setFont("helvetica", "normal");
			doc.text("Vendor GST:", pageWidth - 70, y);
			doc.text(oData.vendorGST || "", pageWidth - 45, y);

			y += (splitVendor.length * 5) + 5;

			// Table
			var tableData = oData.items.map(function(item) {
				return [item.sno, item.type, item.description, parseFloat(item.sendoutQty).toString(), item.uom];
			});

			doc.autoTable({
				startY: y,
				head: [['S.NO', 'MATERIAL TYPE', 'DESCRIPTION', 'QTY', 'UOM']],
				body: tableData,
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0], minCellHeight: 12 },
				columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 40 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 30 }, 4: { cellWidth: 35 } },
				margin: { left: margin, right: margin }
			});

			var finalY = doc.lastAutoTable.finalY;
			
			// Remarks & Vehicle No
			doc.autoTable({
				startY: finalY,
				body: [
					['Remarks', oData.remarks || 'scrap', '', '', ''],
					['Vehicle No', oData.vehicleNo || '', '', '', ''],
					['Weighment slip Ticket No', oData.weighmentSlipNo || '', '', '', ''],
					['Challan Date & Time', oData.challanDateTime || '', '', '', ''],
					['Delivery Number', oData.deliveryNo || '', '', '', ''],
					['Sale Order No', oData.saleOrder || '', '', '', '']
				],
				theme: 'grid',
				bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0], fontStyle: 'bold' },
				columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 'auto' } },
				margin: { left: margin, right: margin },
				showHead: false
			});

			finalY = doc.lastAutoTable.finalY;

			// Signatures
			finalY += 8;
			doc.setFont("helvetica", "normal");
			doc.text("For MEIL Neyveli Energy Private Limited", margin, finalY);
			
			var rightVendorName = vendorText || "Vendor";
			doc.text("For " + rightVendorName, pageWidth - margin, finalY + 8, { align: "right" });

			finalY += 25;
			doc.text("Authorised Signatory", margin, finalY);
			doc.text("Receiver's Sign", pageWidth - margin, finalY + 8, { align: "right" });

			doc.save(oData.sgpNo + ".pdf");
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image(); img.crossOrigin = "Anonymous";
				img.onload = function () {
					var canvas = document.createElement("canvas");
					canvas.width = img.width; canvas.height = img.height;
					var ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
					resolve(canvas.toDataURL("image/png"));
				};
				img.onerror = function (err) { reject(err); }; img.src = url;
			});
		},

		_getMockSaleOrders: function () {
			return [
				{
					saleOrder: "SO-9001",
					vehicleDetails: "AP-16-TJ-9876",
					collectArea: "Boiler Area",
					remarks: "MS Scrap plates from unit 2",
					vendor: "V1",
					vendorName: "Sri Manikandan Traders",
					vendorAddress: "Sri Manikandan Traders, No.102, Vridhachalam Main Road,, Neyveli, India, 607802",
					vendorGST: "33ABEFS1534J1ZB",
					items: [
						{
							sno: "1",
							type: "Metal",
							description: "MS Plates Scrap",
							quantity: "500",
							availQty: "500",
							uom: "KG"
						}
					]
				},
				{
					saleOrder: "SO-9002",
					vehicleDetails: "TS-09-UD-5432",
					collectArea: "Transformer Yard",
					remarks: "Used copper wire cables",
					vendor: "V2",
					vendorName: "Metal Scrap Buyers Pvt Ltd",
					vendorAddress: "Metal Scrap Buyers Pvt Ltd, Chennai",
					vendorGST: "33XXXXXXXXXXXXX",
					items: [
						{
							sno: "1",
							type: "Copper",
							description: "Copper Wire Scrap",
							quantity: "250",
							availQty: "250",
							uom: "KG"
						}
					]
				},
				{
					saleOrder: "SO-9003",
					vehicleDetails: "KA-03-ME-4321",
					collectArea: "Store Room 3",
					remarks: "Old lead acid batteries",
					vendor: "V2",
					vendorName: "Metal Scrap Buyers Pvt Ltd",
					vendorAddress: "Metal Scrap Buyers Pvt Ltd, Chennai",
					vendorGST: "33XXXXXXXXXXXXX",
					items: [
						{
							sno: "1",
							type: "Batteries",
							description: "Lead Batteries",
							quantity: "12",
							availQty: "12",
							uom: "MT"
						}
					]
				}
			];
		},

		onScrapRequestValueHelp: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			var fnOpenDialog = function () {
				if (!that._pScrapRequestValueHelp) {
					that._pScrapRequestValueHelp = sap.ui.core.Fragment.load({
						id: that.getView().getId(),
						name: "zgpms.meilpower.com.view.fragments.ScrapRequestValueHelp",
						controller: that
					}).then(function (oDialog) {
						that.getView().addDependent(oDialog);
						return oDialog;
					});
				}

				that._pScrapRequestValueHelp.then(function (oDialog) {
					oDialog.getBinding("items").filter([]);
					oDialog.open();
				});
			};

			var fnProcessResults = function (aResults) {
				var aMapped = aResults.map(function (item) {
					var sStatus = "Pending";
					if (item.ApprovalReq === "A") {
						sStatus = "Approved";
					} else if (item.ApprovalReq === "P") {
						sStatus = "Pending";
					} else if (item.ApprovalReq === "R") {
						sStatus = "Rejected";
					} else if (item.Status || item.ReqStatus || item.status) {
						sStatus = item.Status || item.ReqStatus || item.status;
					}
					var oLocal = aMockRequests.find(function (loc) {
						return loc.requestId === (item.GatePassReqNo || item.requestId || "");
					});
					if (oLocal && oLocal.status) {
						sStatus = oLocal.status;
					}
					return {
						requestId: item.GatePassReqNo || item.requestId || "",
						saleOrder: item.SalesDocument || item.saleOrder || "",
						vendor: item.SoldToParty || item.vendor || "",
						vendorName: item.CustomerName || item.vendorName || "",
						vendorAddress: item.CustomerAddress || item.vendorAddress || ((item.City || "") + (item.City && item.PostalCode ? ", " : "") + (item.PostalCode || "")),
						vendorGST: item.CustomerGst || item.CustomerGST || item.vendorGST || "",
						city: item.City || item.city || "",
						postalCode: item.PostalCode || item.postalCode || "",
						remarks: item.Remarks || item.remarks || "",
						weighmentSlipNo: item.WeighmentTicket || item.WeighmentSlipNo || item.WBTicketNo || item.weighmentSlipNo || "",
						challanDateTime: item.ChallanDate || item.ChallanDateTime || item.DCDate || item.challanDateTime || "",
						deliveryNo: item.DCNumber || item.deliveryNo || "",
						status: sStatus,
						items: (item.ScrapReqItmNav && item.ScrapReqItmNav.results) || item.items || []
					};
				});

				// Filter for approved requests that have not yet had a gate pass generated
				var aFiltered = aMapped.filter(function (req) {
					return req.status === "Approved";
				});

				that.getView().setModel(new JSONModel({ results: aFiltered }), "requests");
				fnOpenDialog();
			};

			var aMockRequests = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");

			if (!oODataModel) {
				fnProcessResults(aMockRequests);
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ScrapReqHdrSet", {
				urlParameters: { "$expand": "ScrapReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aList = oData.results || [];
					aMockRequests.forEach(function (oLocal) {
						var bExists = aList.some(function (oOData) {
							return (oOData.GatePassReqNo || oOData.requestId) === oLocal.requestId;
						});
						if (!bExists) {
							aList.push(oLocal);
						}
					});
					fnProcessResults(aList);
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					fnProcessResults(aMockRequests);
				}
			});
		},

		onScrapRequestValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new Filter({
				filters: [
					new Filter("requestId", FilterOperator.Contains, sValue),
					new Filter("saleOrder", FilterOperator.Contains, sValue),
					new Filter("vendorName", FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onScrapRequestValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) {
				return;
			}

			var oSelectedReq = oSelectedItem.getBindingContext("requests").getObject();
			this._fillFromScrapRequest(oSelectedReq);
		},

		onScrapRequestValueHelpCancel: function () {},

		onScrapRequestChange: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			if (!sValue) {
				this._initModel("");
				return;
			}

			var oRequestsModel = this.getView().getModel("requests");
			var aRequests = oRequestsModel ? oRequestsModel.getProperty("/results") : [];

			var oSelectedReq = aRequests.find(function (req) {
				return req.requestId === sValue;
			});

			if (oSelectedReq) {
				this._fillFromScrapRequest(oSelectedReq);
			} else {
				var oODataModel = this.getOwnerComponent().getModel();
				var that = this;
				
				var fnFallback = function () {
					var aMockRequests = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
					var oMockReq = aMockRequests.find(function (req) {
						return req.requestId === sValue;
					});
					if (oMockReq) {
						var sStatus = oMockReq.status || "Pending";
						if (sStatus === "Gate Pass Generated") {
							MessageBox.error("Already gate pass created for this request number");
							that._initModel("");
							return;
						}
						if (sStatus !== "Approved") {
							MessageBox.error("Only Approved requests are allowed for Gate Pass creation. Current status: " + sStatus);
							that._initModel("");
							return;
						}
						that._fillFromScrapRequest({
							requestId: oMockReq.requestId,
							saleOrder: oMockReq.saleOrder || "",
							vendor: oMockReq.vendor || "",
							vendorName: oMockReq.vendorName || "",
							vendorAddress: oMockReq.vendorAddress || oMockReq.CustomerAddress || "",
							vendorGST: oMockReq.vendorGST || oMockReq.CustomerGST || "",
							city: oMockReq.city || "",
							postalCode: oMockReq.postalCode || "",
							remarks: oMockReq.remarks || "",
							vehicleNo: oMockReq.vehicleDetails || "",
							items: oMockReq.items || []
						});
					} else {
						MessageToast.show("Invalid Scrap Request No. Please select from help.");
						that._initModel("");
					}
				};

				if (oODataModel) {
					sap.ui.core.BusyIndicator.show(0);
					oODataModel.read("/ScrapReqHdrSet", {
						filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sValue)],
						urlParameters: { "$expand": "ScrapReqItmNav" },
						success: function (oData) {
							sap.ui.core.BusyIndicator.hide();
							var oItem = oData && oData.results && oData.results[0];
							if (oItem) {
								var sStatus = "Pending";
								if (oItem.ApprovalReq === "A") {
									sStatus = "Approved";
								} else if (oItem.ApprovalReq === "P") {
									sStatus = "Pending";
								} else if (oItem.ApprovalReq === "R") {
									sStatus = "Rejected";
								} else if (oItem.Status || oItem.ReqStatus) {
									sStatus = oItem.Status || oItem.ReqStatus;
								}
								
								// check local override just in case
								var aMockRequests = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
								var oMockReq = aMockRequests.find(function (req) {
									return req.requestId === (oItem.GatePassReqNo || "");
								});
								if (oMockReq && oMockReq.status) {
									sStatus = oMockReq.status;
								}

								if (sStatus === "Gate Pass Generated") {
									MessageBox.error("Already gate pass created for this request number");
									that._initModel("");
									return;
								}
								if (sStatus !== "Approved") {
									MessageBox.error("Only Approved requests are allowed for Gate Pass creation. Current status: " + sStatus);
									that._initModel("");
									return;
								}

								that._fillFromScrapRequest({
									requestId: oItem.GatePassReqNo || "",
									saleOrder: oItem.SalesDocument || "",
									vendor: oItem.SoldToParty || "",
									vendorName: oItem.CustomerName || "",
									vendorAddress: oItem.CustomerAddress || ((oItem.City || "") + (oItem.City && oItem.PostalCode ? ", " : "") + (oItem.PostalCode || "")),
									vendorGST: oItem.CustomerGst || "",
									city: oItem.City || "",
									postalCode: oItem.PostalCode || "",
									remarks: oItem.Remarks || "",
									vehicleNo: oItem.VehicleNo || "",
									weighmentSlipNo: oItem.WeighmentTicket || oItem.WeighmentSlipNo || oItem.WBTicketNo || "",
									challanDateTime: oItem.ChallanDate || oItem.ChallanDateTime || oItem.DCDate || "",
									deliveryNo: oItem.DCNumber || "",
									items: (oItem.ScrapReqItmNav && oItem.ScrapReqItmNav.results) || []
								});
							} else {
								fnFallback();
							}
						},
						error: function (oError) {
							sap.ui.core.BusyIndicator.hide();
							fnFallback();
						}
					});
				} else {
					fnFallback();
				}
			}
		},

		_fillFromScrapRequest: function (oSelectedReq) {
			var oModel = this.getView().getModel("scrapGp");
			var that = this;
			if (oSelectedReq) {
				oModel.setProperty("/requestId", oSelectedReq.requestId || "");
				oModel.setProperty("/saleOrder", oSelectedReq.saleOrder || "");
				oModel.setProperty("/vendor", oSelectedReq.vendor || "");
				oModel.setProperty("/vendorName", oSelectedReq.vendorName || "");
				oModel.setProperty("/vendorAddress", oSelectedReq.vendorAddress || "");
				oModel.setProperty("/vendorGST", oSelectedReq.vendorGST || "");
				oModel.setProperty("/city", oSelectedReq.city || "");
				oModel.setProperty("/postalCode", oSelectedReq.postalCode || "");
				oModel.setProperty("/remarks", oSelectedReq.remarks || "");
				oModel.setProperty("/vehicleNo", oSelectedReq.vehicleNo || oSelectedReq.vehicleDetails || "");
				oModel.setProperty("/weighmentSlipNo", oSelectedReq.weighmentSlipNo || "");
				oModel.setProperty("/challanDateTime", oSelectedReq.challanDateTime ? that._formatDate(oSelectedReq.challanDateTime) : "");
				oModel.setProperty("/deliveryNo", oSelectedReq.deliveryNo || "");

				var aItemsRaw = [];
				if (oSelectedReq.items) {
					if (Array.isArray(oSelectedReq.items)) {
						aItemsRaw = oSelectedReq.items;
					} else if (oSelectedReq.items.results && Array.isArray(oSelectedReq.items.results)) {
						aItemsRaw = oSelectedReq.items.results;
					}
				}

				var aItemsMapped = aItemsRaw.map(function (subItem, idx) {
					var sRawUom = (subItem.UOM || subItem.Uom || subItem.uom || "").toUpperCase();
					var sUom = "KG";
					if (sRawUom.indexOf("KG") !== -1 || sRawUom.indexOf("KILOGRAM") !== -1) {
						sUom = "KG";
					} else if (sRawUom.indexOf("LITRE") !== -1 || sRawUom.indexOf("LTR") !== -1 || sRawUom === "L" || sRawUom === "LIT") {
						sUom = "L";
					} else if (sRawUom.indexOf("TON") !== -1 || sRawUom.indexOf("TO") !== -1 || sRawUom.indexOf("MT") !== -1) {
						sUom = "MT";
					}

					var sQty = (subItem.OrderQuantity || subItem.Quantity || subItem.Qty || subItem.availQty || subItem.quantity || "0").toString();

					return {
						sno: String(idx + 1),
						type: that._mapMaterialType(subItem.Material || subItem.MaterialType || subItem.Type || subItem.type || "", subItem.MaterialDesc || subItem.Description || subItem.description || ""),
						description: subItem.MaterialDesc || subItem.Description || subItem.description || "",
						availQty: sQty,
						sendoutQty: sQty, // Default sendout quantity to same as available/order quantity
						uom: sUom
					};
				});

				oModel.setProperty("/items", aItemsMapped);
				MessageToast.show("Scrap Request details auto-filled successfully.");
			}
		},

		_formatDate: function (vDate) {
			if (!vDate) return "";
			if (vDate instanceof Date) {
				var dd = String(vDate.getDate()).padStart(2, "0");
				var mm = String(vDate.getMonth() + 1).padStart(2, "0");
				var yyyy = vDate.getFullYear();
				return dd + "/" + mm + "/" + yyyy;
			}
			if (typeof vDate === "string") {
				if (vDate.indexOf("Date") !== -1) {
					var ts = parseInt(vDate.replace(/\/Date\((\d+)\)\//, "$1"), 10);
					if (!isNaN(ts)) return this._formatDate(new Date(ts));
				}
				if (/^\d{8}$/.test(vDate)) {
					if (vDate === "00000000") return "";
					return vDate.substring(6, 8) + "/" + vDate.substring(4, 6) + "/" + vDate.substring(0, 4);
				}
				var aParts = vDate.split("T")[0].split("-");
				if (aParts.length === 3) return aParts[2] + "/" + aParts[1] + "/" + aParts[0];
			}
			return String(vDate);
		},
onSaleOrderValueHelp: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			var fnOpenDialog = function () {
				if (!that._pSaleOrderValueHelp) {
					that._pSaleOrderValueHelp = sap.ui.core.Fragment.load({
						id: that.getView().getId(),
						name: "zgpms.meilpower.com.view.fragments.SaleOrderValueHelp",
						controller: that
					}).then(function (oDialog) {
						that.getView().addDependent(oDialog);
						return oDialog;
					});
				}

				that._pSaleOrderValueHelp.then(function (oDialog) {
					oDialog.getBinding("items").filter([]);
					oDialog.open();
				});
			};

			var fnProcessResults = function (aResults) {
				var aMapped = aResults.map(function (item) {
					var aItemsRaw = [];
					if (item.SaleodrItmNav) {
						if (Array.isArray(item.SaleodrItmNav)) {
							aItemsRaw = item.SaleodrItmNav;
						} else if (item.SaleodrItmNav.results && Array.isArray(item.SaleodrItmNav.results)) {
							aItemsRaw = item.SaleodrItmNav.results;
						}
					}

					var aItemsMapped = aItemsRaw.map(function (subItem, idx) {
						var sRawType = subItem.MaterialType || subItem.Type || subItem.Matkl || "";
						var sType = "Metal";
						if (sRawType) {
							var aKeys = ["Metal", "Rubber", "Oil", "Plastic", "Copper", "Batteries", "Spent Oil(Barrel Capacity)"];
							var sLower = sRawType.toLowerCase();
							var sFound = aKeys.find(function(k) {
								return k.toLowerCase() === sLower || sLower.indexOf(k.toLowerCase()) !== -1;
							});
							sType = sFound || "Metal";
						}
						
						var sRawUom = (subItem.Uom || subItem.Vrkme || subItem.Meins || subItem.UOM || "").toUpperCase();
						var sUom = "KG";
						if (sRawUom.indexOf("KG") !== -1 || sRawUom.indexOf("KILOGRAM") !== -1) {
							sUom = "KG";
						} else if (sRawUom.indexOf("LITRE") !== -1 || sRawUom.indexOf("LTR") !== -1 || sRawUom === "L" || sRawUom === "LIT") {
							sUom = "L";
						} else if (sRawUom.indexOf("TON") !== -1 || sRawUom.indexOf("TO") !== -1 || sRawUom.indexOf("MT") !== -1) {
							sUom = "MT";
						}

						return {
							sno: String(idx + 1),
							type: sType,
							description: subItem.MaterialDesc || subItem.Arktx || subItem.Description || subItem.Maktx || "",
							quantity: (subItem.OrderQuantity || "0").toString(),
							availQty: (subItem.OrderQuantity || "0").toString(),
							uom: sUom
						};
					});

					return {
						saleOrder: item.SalesDocument || item.Vbeln || item.SalesOrder || "",
						vehicleDetails: item.VehicleDetails || item.VehicleNo || "",
						collectArea: item.CollectArea || item.StorageLocation || item.Lgort || "",
						remarks: item.Remarks || item.Description || item.HeaderTxt || item.Text || "",
						vendor: item.SoldToParty || item.Customer || item.Kunnr || item.Vendor || "",
						vendorName: item.CustomerName || item.Name1 || item.VendorName || "",
						vendorAddress: item.CustomerAddress || item.Address || item.Street || "",
						vendorGST: item.CustomerGST || item.CustomerGst || item.Gst || item.Stcd3 || "",
						city: item.City || "",
						postalCode: item.PostalCode || "",
						items: aItemsMapped
					};
				});

				that.getView().setModel(new JSONModel({ results: aMapped }), "sos");
				fnOpenDialog();
			};

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZsaleOrdersSet", {
				filters: [new Filter("SalesDocType", FilterOperator.EQ, "ZAOM")],
				urlParameters: { "$expand": "SaleodrItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					if (oData && oData.results && oData.results.length > 0) {
						fnProcessResults(oData.results);
					} else {
						that.getView().setModel(new JSONModel({ results: [] }), "sos");
						MessageToast.show("No Sale Orders found.");
						fnOpenDialog();
					}
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load Sale Orders. Please try again.");
				}
			});
		},

		onSaleOrderValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new Filter({
				filters: [
					new Filter("saleOrder", FilterOperator.Contains, sValue),
					new Filter("vendorName", FilterOperator.Contains, sValue),
					new Filter("remarks", FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onSaleOrderValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) {
				return;
			}

			var oSelectedSO = oSelectedItem.getBindingContext("sos").getObject();
			this._fillFromSaleOrder(oSelectedSO);
		},

		onSaleOrderValueHelpCancel: function () {},

		onSaleOrderChange: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			if (!sValue) {
				var oModel = this.getView().getModel("scrapGp");
				oModel.setProperty("/saleOrder", "");
				oModel.setProperty("/vehicleDetails", "");
				oModel.setProperty("/collectArea", "");
				oModel.setProperty("/remarks", "");
				oModel.setProperty("/items", [
					{
						sno: "1",
						type: "",
						description: "",
						quantity: "",
						uom: "KG"
					}
				]);
				return;
			}

			var oSosModel = this.getView().getModel("sos");
			var aSaleOrders = oSosModel ? oSosModel.getProperty("/results") : [];

			var oSelectedSO = aSaleOrders.find(function (so) {
				return so.saleOrder === sValue;
			});

			if (oSelectedSO) {
				this._fillFromSaleOrder(oSelectedSO);
			} else {
				var oODataModel = this.getOwnerComponent().getModel();
				var that = this;
				if (oODataModel) {
					sap.ui.core.BusyIndicator.show(0);
					oODataModel.read("/ZsaleOrdersSet", {
						filters: [
							new Filter("SalesDocType", FilterOperator.EQ, "ZAOM"),
							new Filter("SalesDocument", FilterOperator.EQ, sValue)
						],
						urlParameters: { "$expand": "SaleodrItmNav" },
						success: function (oData) {
							sap.ui.core.BusyIndicator.hide();
							var oItem = oData && oData.results && oData.results[0];
							if (oItem) {
								var aItemsRaw = [];
								if (oItem.SaleodrItmNav) {
									if (Array.isArray(oItem.SaleodrItmNav)) {
										aItemsRaw = oItem.SaleodrItmNav;
									} else if (oItem.SaleodrItmNav.results && Array.isArray(oItem.SaleodrItmNav.results)) {
										aItemsRaw = oItem.SaleodrItmNav.results;
									}
								}
								var aItemsMapped = aItemsRaw.map(function (subItem, idx) {
									var sRawType = subItem.MaterialType || subItem.Type || subItem.Matkl || "";
									var sType = "Metal";
									if (sRawType) {
										var aKeys = ["Metal", "Rubber", "Oil", "Plastic", "Copper", "Batteries", "Spent Oil(Barrel Capacity)"];
										var sLower = sRawType.toLowerCase();
										var sFound = aKeys.find(function(k) {
											return k.toLowerCase() === sLower || sLower.indexOf(k.toLowerCase()) !== -1;
										});
										sType = sFound || "Metal";
									}
									
									var sRawUom = (subItem.Uom || subItem.Vrkme || subItem.Meins || subItem.UOM || "").toUpperCase();
									var sUom = "KG";
									if (sRawUom.indexOf("KG") !== -1 || sRawUom.indexOf("KILOGRAM") !== -1) {
										sUom = "KG";
									} else if (sRawUom.indexOf("LITRE") !== -1 || sRawUom.indexOf("LTR") !== -1 || sRawUom === "L" || sRawUom === "LIT") {
										sUom = "L";
									} else if (sRawUom.indexOf("TON") !== -1 || sRawUom.indexOf("TO") !== -1 || sRawUom.indexOf("MT") !== -1) {
										sUom = "MT";
									}

									return {
										sno: String(idx + 1),
										type: sType,
										description: subItem.MaterialDesc || subItem.Arktx || subItem.Description || subItem.Maktx || "",
										quantity: (subItem.OrderQuantity || subItem.Quantity || subItem.Kwmeng || subItem.Qty || "0").toString(),
										availQty: (subItem.OrderQuantity || subItem.Quantity || subItem.Kwmeng || subItem.Qty || "0").toString(),
										uom: sUom
									};
								});

								var oMapped = {
									saleOrder: oItem.SalesDocument || oItem.Vbeln || oItem.SalesOrder || "",
									vehicleDetails: oItem.VehicleDetails || oItem.VehicleNo || "",
									collectArea: oItem.CollectArea || oItem.StorageLocation || oItem.Lgort || "",
									remarks: oItem.Remarks || oItem.Description || oItem.HeaderTxt || oItem.Text || "",
									vendor: oItem.SoldToParty || oItem.Customer || oItem.Kunnr || oItem.Vendor || "",
									vendorName: oItem.CustomerName || oItem.Name1 || oItem.VendorName || "",
									vendorAddress: oItem.CustomerAddress || oItem.Address || oItem.Street || "",
									vendorGST: oItem.CustomerGST || oItem.CustomerGst || oItem.Gst || oItem.Stcd3 || "",
									city: oItem.City || "",
									postalCode: oItem.PostalCode || "",
									items: aItemsMapped
								};

								that._fillFromSaleOrder(oMapped);
							} else {
								MessageToast.show("Invalid Sale Order. Please select from F4 help.");
								var oModel = that.getView().getModel("scrapGp");
								oModel.setProperty("/saleOrder", "");
							}
						},
						error: function (oError) {
							sap.ui.core.BusyIndicator.hide();
							MessageToast.show("Invalid Sale Order. Please select from F4 help.");
							var oModel = that.getView().getModel("scrapGp");
							oModel.setProperty("/saleOrder", "");
						}
					});
				} else {
					MessageToast.show("Invalid Sale Order. Please select from F4 help.");
					var oModel = this.getView().getModel("scrapGp");
					oModel.setProperty("/saleOrder", "");
				}
			}
		},

		_fillFromSaleOrder: function (oSelectedSO) {
			var oModel = this.getView().getModel("scrapGp");
			if (oSelectedSO) {
				oModel.setProperty("/saleOrder", oSelectedSO.saleOrder || "");
				oModel.setProperty("/vehicleDetails", oSelectedSO.vehicleDetails || "");
				oModel.setProperty("/collectArea", oSelectedSO.collectArea || "");
				oModel.setProperty("/remarks", oSelectedSO.remarks || "");
				oModel.setProperty("/vendor", oSelectedSO.vendor || "");
				oModel.setProperty("/vendorName", oSelectedSO.vendorName || "");
				oModel.setProperty("/vendorGST", oSelectedSO.vendorGST || "");
				oModel.setProperty("/city", oSelectedSO.city || "");
				oModel.setProperty("/postalCode", oSelectedSO.postalCode || "");
				
				if (oSelectedSO.items && oSelectedSO.items.length > 0) {
					var aItems = oSelectedSO.items.map(function (item, idx) {
						return {
							sno: String(idx + 1),
							type: item.type || "",
							description: item.description || "",
							quantity: item.quantity || "",
							uom: item.uom || "KG"
						};
					});
					oModel.setProperty("/items", aItems);
				}
				MessageToast.show("Sale Order details auto-filled successfully.");
			}
		}
	});
});
