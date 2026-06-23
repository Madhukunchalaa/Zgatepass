sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
	"use strict";
	return BaseController.extend("zgpms.meilpower.com.controller.GatePassCreation", {
		formatter: {
			formatHsnCodeDesc: function (sCode, sDesc) {
				if (sCode && sDesc) {
					return sCode + " - " + sDesc;
				}
				return sCode || sDesc || "";
			},
			formatMaterial: function (sCode, sName) {
				if (sCode && sName) {
					return sCode + " - " + sName;
				}
				return sCode || sName || "";
			}
		},

		onMaterialValueHelp: function (oEvent) {
			this._oInputSource = oEvent.getSource();
			this._oRowContext = this._oInputSource.getBindingContext("gp");
			var sPlant = this.getView().getModel("gp").getProperty("/Plant");

			if (!sPlant) {
				MessageToast.show("Please select plant first");
				return;
			}

			if (!this._pMaterialValueHelp) {
				this._pMaterialValueHelp = sap.ui.core.Fragment.load({
					id: this.getView().getId(),
					name: "zgpms.meilpower.com.view.fragments.MaterialValueHelp",
					controller: this
				}).then(function (oDialog) {
					this.getView().addDependent(oDialog);
					return oDialog;
				}.bind(this));
			}

			this._pMaterialValueHelp.then(function (oDialog) {
				oDialog.getBinding("items").filter([]);
				oDialog.open();
			});
		},

		onMaterialValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new Filter({
				filters: [
					new Filter("Material", FilterOperator.Contains, sValue),
					new Filter("MaterialName", FilterOperator.Contains, sValue),
					new Filter("HsnDesc", FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onMaterialValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) {
				return;
			}

			var oSelectedMaterial = oSelectedItem.getBindingContext("materials").getObject();
			var oModel = this.getView().getModel("gp");
			var sPath = this._oRowContext.getPath();

			oModel.setProperty(sPath + "/material", oSelectedMaterial.Material);
			oModel.setProperty(sPath + "/materialName", oSelectedMaterial.MaterialName);
			oModel.setProperty(sPath + "/hsnCode", oSelectedMaterial.HsnCode);
			oModel.setProperty(sPath + "/hsnDesc", oSelectedMaterial.HsnDesc);
			oModel.setProperty(sPath + "/uom", oSelectedMaterial.UOM);
			oModel.setProperty(sPath + "/rate", oSelectedMaterial.UnitPrice);

			var fQty = parseFloat(oModel.getProperty(sPath + "/quantity")) || 0;
			var fRate = parseFloat(oSelectedMaterial.UnitPrice) || 0;
			var fAmount = fQty * fRate;
			oModel.setProperty(sPath + "/amount", fAmount.toLocaleString('en-IN', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));
			this._recalcTotal();

			this._oInputSource.setValueState("None");
		},

		onMaterialValueHelpCancel: function () {},

		onHsnCodeInputSuggest: function (oEvent) {
			var oInput = oEvent.getSource();
			var sValue = (oEvent.getParameter("suggestValue") || "").toUpperCase();

			var aMaterials = (this.getView().getModel("materials") || { getProperty: function () { return []; } }).getProperty("/results") || [];

			var oSeen = {};
			var aFiltered = [];
			aMaterials.forEach(function (m) {
				if (!m.HsnCode || oSeen[m.HsnCode]) { return; }
				if (!sValue || m.HsnCode.toUpperCase().indexOf(sValue) !== -1 || (m.HsnDesc || "").toUpperCase().indexOf(sValue) !== -1) {
					oSeen[m.HsnCode] = true;
					aFiltered.push(m);
				}
			});

			oInput.destroySuggestionItems();
			aFiltered.forEach(function (m) {
				oInput.addSuggestionItem(new sap.ui.core.Item({
					key: m.HsnCode,
					text: m.HsnCode + " - " + (m.HsnDesc || "")
				}));
			});
		},

		onHsnCodeInputSuggestionItemSelected: function (oEvent) {
			var oItem = oEvent.getParameter("selectedItem");
			if (!oItem) { return; }

			var oInput = oEvent.getSource();
			var sPath = oInput.getBindingContext("gp").getPath();
			var oModel = this.getView().getModel("gp");
			var sCode = oItem.getKey();
			var sText = oItem.getText();
			var sDesc = sText.indexOf(" - ") !== -1 ? sText.split(" - ").slice(1).join(" - ") : "";

			oModel.setProperty(sPath + "/hsnCode", sCode);
			oModel.setProperty(sPath + "/hsnDesc", sDesc);
			oInput.setValue(sCode);
		},

		onDescriptionEdit: function (oEvent) {
			var oSource = oEvent.getSource();
			var oContext = oSource.getBindingContext("gp");
			var oModel = this.getView().getModel("gp");
			var sPath = oContext.getPath();

			var sInitialVal = oModel.getProperty(sPath + "/materialName") || "";

			var oConfirmButton = new sap.m.Button({
				text: "Confirm",
				type: "Emphasized",
				enabled: sInitialVal.length <= 250,
				press: function () {
					oModel.setProperty(sPath + "/materialName", oTextArea.getValue().trim());
					oDialog.close();
				}
			});

			var oTextArea = new sap.m.TextArea({
				value: sInitialVal,
				rows: 6,
				maxLength: 250,
				showExceededText: true,
				width: "100%",
				placeholder: "Enter full material description (up to 250 characters)...",
				liveChange: function (oEvent) {
					var sVal = oEvent.getParameter("value") || "";
					var iLen = sVal.length;
					if (iLen > 250) {
						oConfirmButton.setEnabled(false);
					} else {
						oConfirmButton.setEnabled(true);
					}
				}
			});

			var oDialog = new sap.m.Dialog({
				title: "Material Description",
				contentWidth: "460px",
				content: [
					new sap.m.VBox({
						class: "sapUiSmallMarginBeginEnd sapUiSmallMarginTopBottom",
						items: [oTextArea]
					})
				],
				beginButton: oConfirmButton,
				endButton: new sap.m.Button({
					text: "Cancel",
					press: function () { oDialog.close(); }
				}),
				afterClose: function () { oDialog.destroy(); }
			});

			this.getView().addDependent(oDialog);
			oDialog.open();
		},

		onInit: function () {
			this._resetModel(null);
			this._sAmendReqNo = null; // track amendment request number

			var oODataModel = this.getOwnerComponent().getModel();
			if (oODataModel) {
				oODataModel.metadataLoaded().then(function () {
					this._loadPlants();
				}.bind(this)).catch(function () {
					MessageToast.show("Metadata unavailable — you can type Plant code manually.");
				});
			} else {
				this._loadPlants();
			}

			this.getRouter().getRoute("GatePassCreation").attachPatternMatched(this._onRouteMatched, this);
			this.getRouter().getRoute("GatePassAmendment").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			var oArgs = oEvent.getParameter("arguments");
			var sType  = oArgs ? (oArgs.type  || null) : null;
			var sReqNo = oArgs ? (oArgs.reqNo || null) : null;
			var sStatus = oArgs ? (oArgs.status || null) : null;
			if (sReqNo) { sReqNo = decodeURIComponent(sReqNo); }
			if (sType)  { sType  = decodeURIComponent(sType); }
			if (sStatus) { sStatus = decodeURIComponent(sStatus); }

			// Pass type into _resetModel so GatePassType is set in the initial model
			this._resetModel(sType);
			this._sAmendReqNo = sReqNo || null;

			var oModel = this.getView().getModel("gp");

			// If this is an amendment, make fields editable immediately (before async data load)
			// so the user is not stuck looking at a locked read-only form while OData fetches.
			if (sReqNo && oModel) {
				oModel.setProperty("/isFieldEditable", true);
				oModel.setProperty("/isTypeEditable",  false); // GP Type must not change on amendment
			}

			if (oModel) {
				// Pre-fill Plant, Company Code and Department from logged-in user profile
				var oUserModel = sap.ui.getCore().getModel("user");
				if (oUserModel) {
					var sPlant = oUserModel.getProperty("/Plant");
					var sCocode = oUserModel.getProperty("/Cocode");
					var sDept = oUserModel.getProperty("/Department");

					if (sCocode) { oModel.setProperty("/Cocode", sCocode); }
					if (sDept) {
						var oDeptSelect = this.byId("department");
						var sMatchedDept = sDept;
						if (oDeptSelect) {
							var oMatch = oDeptSelect.getItems().find(function (oItem) {
								return oItem.getKey().toUpperCase() === sDept.toUpperCase();
							});
							if (oMatch) { sMatchedDept = oMatch.getKey(); }
						}
						oModel.setProperty("/Department", sMatchedDept);
					}
					if (sPlant) {
						oModel.setProperty("/Plant", sPlant);
						this._loadVendors(sPlant);
						this._loadMaterials(sPlant);
					}
				}
			}

			// If this is an amendment, load the original request data to pre-fill all fields
			if (sReqNo && sType) {
				this._loadAmendmentData(sReqNo, sType, sStatus);
			}
		},

		_loadAmendmentData: function (sReqNo, sType, sStatus) {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;
			if (!oODataModel) { return; }

			// Default status parameter to "AM" or "AMENDMENT" if missing
			var sTargetStatus = sStatus || "AM";

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo),
					new Filter("GatePassType",  FilterOperator.EQ, sType),
					new Filter("Status",        FilterOperator.EQ, sTargetStatus)
				],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oRow = oData.results && oData.results[0];
					if (oRow) {
						that._prefillAmendmentModel(oRow);
					} else {
						// Fallback query if AM status failed
						if (sTargetStatus !== "AMENDMENT") {
							that._loadAmendmentData(sReqNo, sType, "AMENDMENT");
						} else {
							MessageToast.show("Amendment data not found. Please fill in manually.");
						}
					}
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageToast.show("Could not load original request. Please fill in manually.");
				}
			});
		},

		// Pre-fill the "gp" model with data from the original request
		_prefillAmendmentModel: function (oRow) {
			var oModel = this.getView().getModel("gp");
			if (!oModel) { return; }

			// Header fields
			oModel.setProperty("/GatePassReqNo",  oRow.GatePassReqNo  || oRow.GatePassreqNo || "");
			oModel.setProperty("/GatePassType",   oRow.GatePassType   || "");
			oModel.setProperty("/isTypeEditable", false);
			oModel.setProperty("/isFieldEditable", true);
			oModel.setProperty("/Cocode",         oRow.CoCode         || oRow.Cocode        || "");
			oModel.setProperty("/Plant",          oRow.Plant          || "");
			oModel.setProperty("/FiscalYear",     oRow.FiscalYear     || "");
			oModel.setProperty("/vendor",         oRow.Vendor         || "");
			oModel.setProperty("/vendorName",     oRow.VendorName     || "");
			oModel.setProperty("/vendorGST",      oRow.VendorGST      || oRow.VendorGst     || "");
			oModel.setProperty("/vendorAddress",  [oRow.City, oRow.ZipCode].filter(Boolean).join(", "));
			oModel.setProperty("/Department",     oRow.Department     || "");
			oModel.setProperty("/VehicleNo",      oRow.VehicleNo      || "");
			oModel.setProperty("/ModeOfDispatch", oRow.ModeOfDispatch || "");
			oModel.setProperty("/Remarks",        oRow.Remarks        || "");

			// Date parsing helper
			var fnParseDate = function (vDate) {
				if (!vDate || vDate === "00000000" || vDate === "") { return null; }
				if (vDate instanceof Date) { return vDate; }
				if (typeof vDate === "string" && vDate.indexOf("/Date(") === 0) {
					var ms = parseInt(vDate.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
					return new Date(ms);
				}
				if (typeof vDate === "string" && /^\d{8}$/.test(vDate)) {
					var y = parseInt(vDate.slice(0, 4), 10);
					var m = parseInt(vDate.slice(4, 6), 10) - 1;
					var d = parseInt(vDate.slice(6, 8), 10);
					return new Date(y, m, d);
				}
				var parsed = new Date(vDate);
				return isNaN(parsed.getTime()) ? null : parsed;
			};

			var oRawDate = oRow.GpDate || oRow.Gpdate || oRow.GPDate || oRow.GatePassDate || oRow.GatepassDate || oRow.RequestDate || oRow.Requestdate || oRow.CreateDate || oRow.CreatedOn || oRow.Erdat || oRow.Aedat;
			var oParsedGpDate = fnParseDate(oRawDate) || new Date();
			oModel.setProperty("/gpDate", oParsedGpDate);

			var oRawRetDate = oRow.ReturnableDate || oRow.Returnabledate || oRow.RetDate || oRow.Retdate;
			var oParsedRetDate = fnParseDate(oRawRetDate);
			oModel.setProperty("/returnableDate", oParsedRetDate);

			// Items
			var aRaw = (oRow.GateReqItmNav && oRow.GateReqItmNav.results) ||
			           (oRow.GateReqItemNav && oRow.GateReqItemNav.results) || [];
			var aItems = aRaw.map(function (it, i) {
				var fQty  = parseFloat(it.RequestedQuantity || it.Quantity || 0);
				var fRate = parseFloat(it.ItemNetPrice || 0);
				return {
					sno:          String(i + 1).padStart(2, "0"),
					material:     it.Material     || "",
					materialName: it.MaterialDesc || it.HSNDesc || it.Description || "",
					hsnCode:      it.HSNCode      || "",
					hsnDesc:      it.HSNDesc      || "",
					quantity:     fQty,
					uom:          it.UOM          || "",
					rate:         fRate,
					amount:       (fQty * fRate).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
					remarks:      it.Remarks      || ""
				};
			});
			if (aItems.length === 0) { aItems = [this._newItem(1)]; }
			oModel.setProperty("/items", aItems);
			this._recalcTotal();

			// Load vendors and materials for the plant so value helps work
			var sPlant = oRow.Plant || "";
			if (sPlant) {
				this._loadVendors(sPlant);
				this._loadMaterials(sPlant);
			}

			// Load original attachment if any
			this._loadAmendmentBase64(oRow.GatePassReqNo || oRow.GatePassreqNo || "", oRow.GatePassType || "");

			MessageToast.show("Amendment: All original fields loaded. Please review and resubmit.", { duration: 4000 });
		},

		_loadAmendmentBase64: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oGpModel = this.getView().getModel("gp");
			if (!oODataModel || !oGpModel || !sReqNo) { return; }
			var that = this;

			// First, check localStorage fallback
			try {
				var sLocalAttach = localStorage.getItem("attachments_" + sReqNo);
				if (sLocalAttach) {
					var aLocal = JSON.parse(sLocalAttach);
					if (aLocal && aLocal.length > 0) {
						aLocal.forEach(function (att) {
							if (att.type) {
								var sT = att.type.toUpperCase().trim();
								if (sT.indexOf("PDF") !== -1 || sT === "APPLICATION/PDF") {
									att.type = "pdf";
								} else if (sT.indexOf("PNG") !== -1 || sT === "IMAGE/PNG") {
									att.type = "png";
								} else if (sT.indexOf("JPG") !== -1 || sT.indexOf("JPEG") !== -1 || sT === "IMAGE/JPEG") {
									att.type = "jpg";
								} else if (sT.indexOf("DOC") !== -1 || sT.indexOf("WORD") !== -1 || sT.indexOf("OFFICEDOCUMENT") !== -1) {
									att.type = "docx";
								}
							}
						});
						oGpModel.setProperty("/attachments", aLocal);
						return; // successfully loaded from local cache
					}
				}
			} catch (e) {
				console.error("Error loading localStorage attachments for amendment: ", e);
			}

			// If not in localStorage, query backend creation entity
			var sKeyPath = "/GatePassReqHdrSet(GatePassReqNo='" + sReqNo + "',GatePassType='" + sType + "')";
			oODataModel.read(sKeyPath, {
				success: function (oData) {
					var aAttachments = that._processLoadedAttachmentsForCreation(oData);
					if (aAttachments.length > 0) {
						oGpModel.setProperty("/attachments", aAttachments);
					} else {
						// Try filter fallback
						oODataModel.read("/GatePassReqHdrSet", {
							filters: [new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo)],
							success: function (oData2) {
								var oItem = oData2.results && oData2.results[0];
								if (oItem) {
									var aAttachmentsFallback = that._processLoadedAttachmentsForCreation(oItem);
									oGpModel.setProperty("/attachments", aAttachmentsFallback);
								}
							},
							error: function (oErr) {
								console.error("Filter OData read on /GatePassReqHdrSet failed: ", oErr);
							}
						});
					}
				},
				error: function (oError) {
					console.error("Direct OData read on " + sKeyPath + " failed. Trying filter query.", oError);
					
					// Try filter fallback
					oODataModel.read("/GatePassReqHdrSet", {
						filters: [new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo)],
						success: function (oData2) {
							var oItem = oData2.results && oData2.results[0];
							if (oItem) {
								var aAttachmentsFallback = that._processLoadedAttachmentsForCreation(oItem);
								oGpModel.setProperty("/attachments", aAttachmentsFallback);
							}
						},
						error: function (oErr) {
							console.error("Filter OData read on /GatePassReqHdrSet failed: ", oErr);
						}
					});
				}
			});
		},

		_processLoadedAttachmentsForCreation: function (oData) {
			var aAttachments = [];
			if (!oData) return aAttachments;

			// Attachment 1
			var sImg1 = oData.Base64Img1 || oData.Base64img1 || "";
			var sFname1 = oData.FILENAME || oData.Filename || oData.FileName || oData.Fname || "";
			var sFtype1 = (oData.FILETYPE || oData.Filetype || oData.FileType || oData.Ftype || "").toUpperCase().trim();
			if (sImg1) {
				if (sFtype1) {
					if (sFtype1.indexOf("PDF") !== -1 || sFtype1 === "APPLICATION/PDF") {
						sFtype1 = "PDF";
					} else if (sFtype1.indexOf("PNG") !== -1 || sFtype1 === "IMAGE/PNG") {
						sFtype1 = "PNG";
					} else if (sFtype1.indexOf("JPG") !== -1 || sFtype1.indexOf("JPEG") !== -1 || sFtype1 === "IMAGE/JPEG") {
						sFtype1 = "JPG";
					} else if (sFtype1.indexOf("DOC") !== -1 || sFtype1.indexOf("WORD") !== -1 || sFtype1.indexOf("OFFICEDOCUMENT") !== -1) {
						sFtype1 = "DOCX";
					}
				}
				var sMime1 = "image/jpeg";
				if (sFtype1 === "PDF") sMime1 = "application/pdf";
				else if (sFtype1 === "PNG") sMime1 = "image/png";
				else if (sFtype1 === "GIF") sMime1 = "image/gif";
				
				var sFullContent1 = sImg1;
				if (sImg1.indexOf("data:") !== 0) {
					sFullContent1 = "data:" + sMime1 + ";base64," + sImg1;
				}
				
				var sFullFileName1 = sFname1 ? (sFname1 + "." + sFtype1.toLowerCase()) : ("attachment1." + sFtype1.toLowerCase());
				aAttachments.push({
					name: sFullFileName1,
					size: "",
					content: sFullContent1,
					type: sFtype1.toLowerCase()
				});
			}

			// Attachment 2
			var sImg2 = oData.Base64Img2 || oData.Base64img2 || "";
			var sFname2 = oData.FILENAME2 || oData.Filename2 || oData.FileName2 || oData.Fname2 || "";
			var sFtype2 = (oData.FILETYPE2 || oData.Filetype2 || oData.FileType2 || oData.Ftype2 || "").toUpperCase().trim();
			if (sImg2) {
				if (sFtype2) {
					if (sFtype2.indexOf("PDF") !== -1 || sFtype2 === "APPLICATION/PDF") {
						sFtype2 = "PDF";
					} else if (sFtype2.indexOf("PNG") !== -1 || sFtype2 === "IMAGE/PNG") {
						sFtype2 = "PNG";
					} else if (sFtype2.indexOf("JPG") !== -1 || sFtype2.indexOf("JPEG") !== -1 || sFtype2 === "IMAGE/JPEG") {
						sFtype2 = "JPG";
					} else if (sFtype2.indexOf("DOC") !== -1 || sFtype2.indexOf("WORD") !== -1 || sFtype2.indexOf("OFFICEDOCUMENT") !== -1) {
						sFtype2 = "DOCX";
					}
				}
				var sMime2 = "image/jpeg";
				if (sFtype2 === "PDF") sMime2 = "application/pdf";
				else if (sFtype2 === "PNG") sMime2 = "image/png";
				else if (sFtype2 === "GIF") sMime2 = "image/gif";
				
				var sFullContent2 = sImg2;
				if (sImg2.indexOf("data:") !== 0) {
					sFullContent2 = "data:" + sMime2 + ";base64," + sImg2;
				}
				
				var sFullFileName2 = sFname2 ? (sFname2 + "." + sFtype2.toLowerCase()) : ("attachment2." + sFtype2.toLowerCase());
				aAttachments.push({
					name: sFullFileName2,
					size: "",
					content: sFullContent2,
					type: sFtype2.toLowerCase()
				});
			}

			return aAttachments;
		},

		_loadPlants: function () {
			var oPlantModel = new JSONModel({ results: [] });
			this.getView().setModel(oPlantModel, "plants");

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZPlantSet", {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					if (aResults.length === 0) { return; }
					var aNormalized = aResults.map(function (p) {
						return {
							Plant: p.Plant || p.Matnr || "",
							PlantName: p.PlantName || p.Pname || p.Name1 || p.Plantname || p.Plant || "",
							CoCode: p.CoCode || p.CompanyCode || "",
							UOM: p.Meins || p.Uom || p.BaseUOM || ""
						};
					});
					oPlantModel.setProperty("/results", aNormalized);
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sStatus = oError.statusCode || oError.status || "";
					var sDetail = "";
					try {
						var oResp = JSON.parse(oError.responseText);
						sDetail = oResp.error && (oResp.error.message.value || oResp.error.message) || "";
					} catch (e) {
						sDetail = oError.responseText || oError.message || "";
					}
					var sHint = sStatus ? (" (HTTP " + sStatus + ")") : "";
					MessageToast.show("Plant list unavailable" + sHint + " — type Plant code manually.", { duration: 4000 });
				}
			});
		},

		_resetModel: function (sType) {
			var oViewModel = new JSONModel({
				GatePassReqNo: "",
				GatePassType: sType || "",
				isTypeEditable: !sType,
				isFieldEditable: false,
				Cocode: "",
				Plant: "",
				FiscalYear: String(new Date().getFullYear()),
				gpDate: new Date(),
				returnableDate: null,
				vendor: "",
				vendorName: "",
				vendorAddress: "",
				vendorGST: "",
				fileName: "",
				attachments: [],
				Department: "",
				VehicleNo: "",
				ModeOfDispatch: "",
				items: [
					this._newItem(1)
				],
				Remarks: "",
				finalTotal: "0.00"
			});
			this.getView().setModel(oViewModel, "gp");
		},

		_newItem: function (iSno) {
			return {
				sno: String(iSno).padStart(2, '0'),
				material: "",
				materialName: "",
				hsnCode: "",
				hsnDesc: "",
				quantity: 1,
				uom: "",
				rate: 0,
				amount: "0.00"
			};
		},

		_loadMaterials: function (sPlant) {
			var oMaterialsModel = this.getView().getModel("materials");
			if (!oMaterialsModel) {
				oMaterialsModel = new JSONModel({ results: [] });
				this.getView().setModel(oMaterialsModel, "materials");
			}

			if (!sPlant) {
				oMaterialsModel.setProperty("/results", []);
				return;
			}

			oMaterialsModel.setProperty("/results", []);

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var aFilters = [new Filter("Plant", FilterOperator.EQ, sPlant)];

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZMaterialSet", {
				filters: aFilters,
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					var aNormalized = aResults.map(function (m) {
						return {
							Material: m.Material || m.Matnr || "",
							MaterialName: m.Maktx || m.MaterialDesc || m.Description || m.MatDesc || m.Materialtxt || m.Material || "",
							HsnDesc: m.HSNDesc || "",
							HsnCode: m.HSNCode || "",
							UOM: m.Meins || m.Uom || m.BaseUOM || m.UOM || "",
							UnitPrice: parseFloat(m.UnitPrice) || 0
						};
					});
					oMaterialsModel.setProperty("/results", aNormalized);
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Failed to load materials for plant " + sPlant;
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg += "\nDetails: " + (oResp.error.message.value || oResp.error.message || "Unknown error");
					} catch (e) {
						if (oError.message) { sMsg += "\nMessage: " + oError.message; }
					}
					MessageBox.error(sMsg);
				}
			});
		},

		onPlantChange: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) { return; }

			var sKey = oSelectedItem.getKey();
			this._applyPlant(sKey);
		},

		onComboBoxPlantChange: function (oEvent) {
			// Only handle manual typed input — skip if user selected from the dropdown list
			if (oEvent.getSource().getSelectedItem()) { return; }
			var sValue = (oEvent.getParameter("value") || "").trim().toUpperCase();
			if (!sValue) { return; }
			this._applyPlant(sValue);
		},

		_applyPlant: function (sKey) {
			var oGpModel = this.getView().getModel("gp");
			oGpModel.setProperty("/Plant", sKey);

			var oPlantModel = this.getView().getModel("plants");
			var aPlants = (oPlantModel && oPlantModel.getProperty("/results")) || [];
			var oPlant = aPlants.find(function (p) { return p.Plant === sKey; });
			if (oPlant && oPlant.CoCode) {
				oGpModel.setProperty("/Cocode", oPlant.CoCode);
			}

			var aItems = oGpModel.getProperty("/items");
			aItems.forEach(function (item) {
				item.material = "";
				item.materialName = "";
				item.hsnCode = "";
				item.hsnDesc = "";
				item.uom = "";
				item.rate = 0;
				item.amount = "0.00";
			});
			oGpModel.setProperty("/items", aItems);
			this._recalcTotal();

			this._loadVendors(sKey);
			this._loadMaterials(sKey);

			MessageToast.show("Materials refreshed for selected plant");
		},

		_loadVendors: function (sPlant) {
			var oVendorModel = new JSONModel({ results: [] });
			this.getView().setModel(oVendorModel, "vendors");

			if (!sPlant) { return; }

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var aFilters = [new Filter("Plant", FilterOperator.EQ, sPlant)];

			oODataModel.read("/ZVendorSet", {
				filters: aFilters,
				success: function (oData) {
					var aResults = oData.results || [];
					if (aResults.length === 0) { return; }
					var aNormalized = aResults.map(function (v) {
						return {
							Vendor: v.Vendor || v.Lifnr || "",
							VendorName: v.Name || v.VendorName || v.Name1 || "Unknown Vendor",
							Street: v.Address || v.Street || "",
							City: v.City || "",
							PostalCode: v.ZipCode || v.PostalCode || "",
							Country: v.Country || "",
							VendorGST: v.VendorGST || v.TaxNumber1 || ""
						};
					});
					oVendorModel.setProperty("/results", aNormalized);
				},
				error: function (oError) {
					MessageBox.error("Failed to load vendors. Please try again.");
				}
			});
		},

		onVendorSelect: function (oEvent) {
			var oItem = oEvent.getParameter("selectedItem");
			if (!oItem) { return; }

			var sKey = oItem.getKey();
			var aVendors = this.getView().getModel("vendors").getProperty("/results");
			var oVendor = aVendors.find(function (v) { return v.Vendor === sKey; });
			if (!oVendor) { return; }

			var sAddress = [oVendor.Street, oVendor.City, oVendor.PostalCode, oVendor.Country].filter(Boolean).join(", ");

			var oGp = this.getView().getModel("gp");
			oGp.setProperty("/vendorAddress", sAddress);
			oGp.setProperty("/vendorGST", oVendor.VendorGST);
		},

		onFileChange: function (oEvent) {
			var oModel = this.getView().getModel("gp");
			var aFiles = oEvent.getParameter("files");
			var aCurrent = oModel.getProperty("/attachments") || [];

			if (aFiles && aFiles.length > 0) {
				if (aCurrent.length + aFiles.length > 2) {
					sap.m.MessageBox.error("You can only upload a maximum of 2 attachments.");
					oEvent.getSource().clear();
					return;
				}
				var readAndAdd = function (oFile) {
					var reader = new FileReader();
					reader.onload = function (e) {
						var sBase64 = e.target.result;
						var sSize = "";
						if (oFile.size < 1024) {
							sSize = oFile.size + " Bytes";
						} else if (oFile.size < 1048576) {
							sSize = (oFile.size / 1024).toFixed(1) + " KB";
						} else {
							sSize = (oFile.size / 1048576).toFixed(1) + " MB";
						}
						
						var bExists = aCurrent.some(function (att) {
							return att.name === oFile.name;
						});
						if (!bExists) {
							aCurrent.push({
								name: oFile.name,
								size: sSize,
								content: sBase64,
								type: oFile.type || (oFile.name.split(".").pop().toLowerCase())
							});
							oModel.setProperty("/attachments", aCurrent);
						}
					};
					reader.readAsDataURL(oFile);
				};

				for (var i = 0; i < aFiles.length; i++) {
					readAndAdd(aFiles[i]);
				}
			}

			// Clear the file uploader input so the same files can be selected again
			oEvent.getSource().clear();
		},

		onDeleteAttachment: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gp").getObject();
			var oModel = this.getView().getModel("gp");
			var aAttachments = oModel.getProperty("/attachments") || [];
			var iIndex = aAttachments.indexOf(oItem);
			if (iIndex > -1) {
				aAttachments.splice(iIndex, 1);
				oModel.setProperty("/attachments", aAttachments);
			}
		},

		onAddItem: function () {
			var oGp = this.getView().getModel("gp");
			var aItems = oGp.getProperty("/items");
			aItems.push(this._newItem(aItems.length + 1));
			oGp.setProperty("/items", aItems);
		},

		onRemoveItem: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gp").getObject();
			var oGp = this.getView().getModel("gp");
			var aItems = oGp.getProperty("/items");
			var iIndex = aItems.indexOf(oItem);
			if (iIndex > -1) {
				aItems.splice(iIndex, 1);
				aItems.forEach(function (it, i) {
					it.sno = String(i + 1).padStart(2, '0');
				});
				oGp.setProperty("/items", aItems);
				this._recalcTotal();
			}
		},

		onQtyRateChange: function (oEvent) {
			var oSource = oEvent.getSource();
			var oContext = oSource.getBindingContext("gp");
			var oModel = this.getView().getModel("gp");

			var oBinding = oSource.getBinding("value");
			if (oBinding) {
				var fValue = parseFloat(oSource.getValue()) || 0;
				if (fValue < 0) {
					fValue = 0;
					oSource.setValue("0");
				}
				oModel.setProperty(oContext.getPath() + "/" + oBinding.getPath(), fValue);
			}

			var oItem = oContext.getObject();
			var fQty = parseFloat(oItem.quantity) || 0;
			var fRate = parseFloat(oItem.rate) || 0;
			var fAmount = fQty * fRate;

			oModel.setProperty(oContext.getPath() + "/amount", fAmount.toLocaleString('en-IN', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));

			this._recalcTotal();
		},

		_recalcTotal: function () {
			var oGp = this.getView().getModel("gp");
			var aItems = oGp.getProperty("/items");
			var fTotal = 0;

			aItems.forEach(function (it) {
				var fAmt = parseFloat(String(it.amount).replace(/,/g, '')) || 0;
				fTotal += fAmt;
			});

			oGp.setProperty("/finalTotal", fTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		},

		onSubmit: function () {
			try {
				var oGp = this.getView().getModel("gp").getData();

				if (!oGp.Plant) {
					MessageBox.error("Please select Plant first.");
					return;
				}

				if (!oGp.vendor) {
					MessageBox.error("Please select a Vendor.");
					return;
				}

				if (!oGp.Department) {
					MessageBox.error("Please select a Department.");
					return;
				}

				if (oGp.Remarks && oGp.Remarks.length > 250) {
					MessageBox.error("Remarks cannot exceed 250 characters.");
					return;
				}

				if (oGp.GatePassType === "RGP" && !oGp.returnableDate) {
					MessageBox.error("Please select Returnable Date for RGP.");
					return;
				}

				// Validate items list
				var aItems = oGp.items || [];
				if (aItems.length === 0) {
					MessageBox.error("Please add at least one item.");
					return;
				}

				for (var i = 0; i < aItems.length; i++) {
					var oItem = aItems[i];
					if (!oItem.materialName || !oItem.materialName.trim()) {
						MessageBox.error("Material Description is required at row " + (i + 1) + ".");
						return;
					}

					var fQty = parseFloat(String(oItem.quantity || "").replace(/,/g, '')) || 0;
					if (fQty <= 0) {
						MessageBox.error("Quantity must be greater than 0 at row " + (i + 1) + ".");
						return;
					}

					var fRate = parseFloat(String(oItem.rate || "").replace(/,/g, '')) || 0;
					if (fRate <= 0) {
						MessageBox.error("Rate must be greater than 0 at row " + (i + 1) + ".");
						return;
					}

					if (!oItem.hsnCode || !oItem.hsnCode.trim()) {
						MessageBox.error("HSN Code is mandatory at row " + (i + 1) + ".");
						return;
					}
					if (!/^\d{8}$/.test(oItem.hsnCode.trim())) {
						MessageBox.error("HSN Code must be exactly 8 digits at row " + (i + 1) + ". Entered: \"" + oItem.hsnCode.trim() + "\"");
						return;
					}
				}

				var oVendorModel = this.getView().getModel("vendors");
				var aVendorList = (oVendorModel && oVendorModel.getProperty("/results")) || [];
				var oSelectedVendor = aVendorList.find(function (v) {
					return v.Vendor === oGp.vendor;
				}) || {};

				var fnFormatDate = function (oDate) {
					if (!oDate) return "";
					if (typeof oDate === "string" && oDate.length === 8 && !isNaN(oDate)) {
						return oDate;
					}
					var d = (oDate instanceof Date) ? oDate : new Date(oDate);
					if (isNaN(d.getTime())) return "";
					var y = d.getFullYear();
					var m = String(d.getMonth() + 1).padStart(2, '0');
					var day = String(d.getDate()).padStart(2, '0');
					return y + m + day;
				};

				var sRawImage1 = (oGp.attachments && oGp.attachments.length > 0) ? oGp.attachments[0].content : "";
				var iComma1 = sRawImage1.indexOf("base64,");
				if (iComma1 !== -1) {
					sRawImage1 = sRawImage1.substring(iComma1 + 7);
				}

				var sRawImage2 = (oGp.attachments && oGp.attachments.length > 1) ? oGp.attachments[1].content : "";
				var iComma2 = sRawImage2.indexOf("base64,");
				if (iComma2 !== -1) {
					sRawImage2 = sRawImage2.substring(iComma2 + 7);
				}

				// Determine if this is an amendment resubmit (carry same request number)
				var sAmendReqNo = this._sAmendReqNo || "";

				var oPayload = {
					GatePassType: oGp.GatePassType,
					Cocode: oGp.Cocode,
					Plant: oGp.Plant,
					FiscalYear: oGp.FiscalYear,
					GpDate: fnFormatDate(oGp.gpDate),
					Vendor: oGp.vendor,
					VendorName: oSelectedVendor.VendorName || "",
					VendorGST: oGp.vendorGST || "",
					ZipCode: oSelectedVendor.PostalCode || "",
					City: oSelectedVendor.City || "",
					ApprovalReq: "X",
					Approval1: "",
					Approval2: "",
					StoreAmmend: "",
					GatePassReqNo: sAmendReqNo, // same request number for amendment resubmit
					Department: oGp.Department,
					VehicleNo: oGp.VehicleNo || "",
					ModeOfDispatch: oGp.ModeOfDispatch || "",
					Remarks: oGp.Remarks || "",
					ReturnableDate: fnFormatDate(oGp.returnableDate),
					Base64Img1: sRawImage1,
					Base64Img2: sRawImage2,

					GateReqItemNav: (oGp.items || []).map(function (it, index) {
						var fQty = parseFloat(String(it.quantity).replace(/,/g, '')) || 0;
						var fRate = parseFloat(String(it.rate).replace(/,/g, '')) || 0;
						var fValue = fQty * fRate;

						return {
							GatePassType: oGp.GatePassType || "",
							ItemNo: String((index + 1) * 10).padStart(5, '0'),
							Material: it.material || "",
							MaterialDesc: it.materialName || "",
							HSNCode: it.hsnCode || "",
							HSNDesc: it.hsnDesc || "",
							UOM: it.uom || "EA",
							ItemNetPrice: fRate.toFixed(2),
							RequestedQuantity: fQty.toFixed(3),
							Totalvalue: fValue.toFixed(2),
							Remarks: it.remarks || ""
						};
					})
				};

				// Only include file metadata fields when a file is actually uploaded
				if (oGp.attachments && oGp.attachments.length > 0) {
					var sAttachName = oGp.attachments[0].name || "";
					var iDot = sAttachName.lastIndexOf(".");
					oPayload.Fname = iDot !== -1 ? sAttachName.substring(0, iDot) : sAttachName;
					oPayload.Ftype = iDot !== -1 ? sAttachName.substring(iDot + 1).toUpperCase() : "";
				} else {
					oPayload.Fname = "";
					oPayload.Ftype = "";
				}

				if (oGp.attachments && oGp.attachments.length > 1) {
					var sAttachName2 = oGp.attachments[1].name || "";
					var iDot2 = sAttachName2.lastIndexOf(".");
					oPayload.Fname2 = iDot2 !== -1 ? sAttachName2.substring(0, iDot2) : sAttachName2;
					oPayload.Ftype2 = iDot2 !== -1 ? sAttachName2.substring(iDot2 + 1).toUpperCase() : "";
				} else {
					oPayload.Fname2 = "";
					oPayload.Ftype2 = "";
				}

				var oODataModel = this.getOwnerComponent().getModel();
				if (!oODataModel) {
					MessageBox.error("Backend OData service not connected.");
					return;
				}

				sap.ui.core.BusyIndicator.show(0);

				oODataModel.create("/GatePassReqHdrSet", oPayload, {
					success: function (oData) {
						sap.ui.core.BusyIndicator.hide();

						var sReqNo = oData.GatePassReqNo || oData.GatePassreqNo || "";
						if (sReqNo) {
							var aCurrentAttachments = this.getView().getModel("gp").getProperty("/attachments") || [];
							if (aCurrentAttachments.length > 0) {
								localStorage.setItem("attachments_" + sReqNo, JSON.stringify(aCurrentAttachments));
							}
						}
						var sMsg = oData.Message || "Gate Pass Request created successfully!";
						var sDisplayMsg = sMsg;
						if (sReqNo && sMsg.indexOf(sReqNo) === -1) {
							sDisplayMsg += "\nRequest Number: " + sReqNo;
						}

						MessageBox.success(sDisplayMsg, {
							actions: [MessageBox.Action.OK, "Copy Number"],
							emphasizedAction: MessageBox.Action.OK,
							onClose: function (sAction) {
								if (sAction === "Copy Number") {
									navigator.clipboard.writeText(sReqNo).then(function () {
										MessageToast.show("Request Number " + sReqNo + " copied!");
									}).catch(function () {
										var textArea = document.createElement("textarea");
										textArea.value = sReqNo;
										document.body.appendChild(textArea);
										textArea.select();
										document.execCommand('copy');
										document.body.removeChild(textArea);
										MessageToast.show("Request Number copied!");
									});
								}
								var sCurrentType = this.getView().getModel("gp").getProperty("/GatePassType");
								var bWasAmend = !!this._sAmendReqNo;
								this._resetModel(sCurrentType);
								this._sAmendReqNo = null;
								if (bWasAmend) {
									this.getRouter().navTo("GatePassList");
								}
							}.bind(this)
						});
					}.bind(this),

					error: function (oError) {
						sap.ui.core.BusyIndicator.hide();
						var sErrorMsg = "Failed to create Gate Pass.";
						try {
							var oResp = JSON.parse(oError.responseText);
							sErrorMsg = oResp.error.message.value;
						} catch (e) {}
						MessageBox.error(sErrorMsg);
					}
				});

			} catch (err) {
				sap.ui.core.BusyIndicator.hide();
				MessageBox.error("Client Error: " + err.message);
			}
		},

		onClear: function () {
			var sCurrentType = this.getView().getModel("gp").getProperty("/GatePassType");
			this._resetModel(sCurrentType);
		}
	});
});
